import { foldToAscii } from '../../common/utils/ascii-fold';
import { normalizePlainText } from './text-normalization';

/**
 * Company name normalization (M6.2, `ARCHITECTURE.md` §6.2, `DATABASE.md` §6).
 *
 * `companySlug` is not a display value and not a URL segment. It is the **dedup
 * partition key**: tier 2 hashes it into `dedupHash`, and tier 3 only compares
 * titles within one slug (§6.3). Two consequences drive every rule below.
 *
 *  - **The same employer must slug identically across sources.** Boards write the
 *    legal form differently ("Example GmbH", "Example Gmbh.", "EXAMPLE GMBH & Co.
 *    KG"), so the legal form is stripped rather than carried.
 *  - **Two different employers must not collide.** A collision merges two real
 *    vacancies into one and hides one from the user, which is the expensive error;
 *    a split merely shows a duplicate. So the rules stay conservative: nothing but
 *    legal forms, punctuation and diacritics is removed, and the name's own words
 *    are never dropped.
 *
 * This rule is versioned with the deduplication logic. **Changing it invalidates
 * every stored `dedupHash`** and needs the recompute migration of `DATABASE.md` §6,
 * which is one of the reasons `RawJobDocument` is retained.
 */

/**
 * Legal forms, as they look after punctuation is removed. Stripped only from the
 * **end** of the name: a leading or interior match is part of the name ("Inc Magazin
 * Verlag", "AG Solutions"), and removing it would fold unrelated companies together.
 *
 * Single tokens are stripped repeatedly, so "GmbH & Co. KG" comes off as `kg`, then
 * `co`, then `gmbh` without needing an entry of its own.
 */
const LEGAL_FORM_TOKENS: ReadonlySet<string> = new Set([
  // German-speaking
  'gmbh',
  'mbh',
  'ug',
  'ag',
  'kgaa',
  'kg',
  'ohg',
  'gbr',
  'eg',
  'ek',
  'se',
  'haftungsbeschraenkt',
  // English-speaking
  'ltd',
  'limited',
  'plc',
  'llp',
  'llc',
  'lp',
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'company',
  'co',
  'pty',
  'pte',
  // Low Countries
  'bv',
  'nv',
  'cv',
  'vof',
  'bvba',
  'cvba',
  // Romance
  'sarl',
  'sas',
  'sasu',
  'sa',
  'sl',
  'slu',
  'srl',
  'spa',
  // Nordic
  'ab',
  'oyj',
  'oy',
  'asa',
  'aps',
  // Central and Eastern Europe
  'sro',
  'spzoo',
  'doo',
  'dd',
  'kft',
  'zrt',
  'nyrt',
]);

/**
 * Legal forms that survive punctuation removal as several tokens: `A/S` becomes
 * `a s`, `S.à r.l.` becomes `s a r l`. Matched longest-first so a shorter entry
 * cannot consume part of a longer one.
 */
const LEGAL_FORM_PHRASES: ReadonlyArray<readonly string[]> = [
  ['s', 'a', 'r', 'l'],
  // `S.à r.l.` loses its dots before this runs, so the tokens are `sa rl`.
  ['sa', 'rl'],
  ['sp', 'z', 'o', 'o'],
  ['sp', 'z', 'oo'],
  ['s', 'r', 'o'],
  ['d', 'o', 'o'],
  ['a', 's'],
]
  .slice()
  .sort((left, right) => right.length - left.length);

/**
 * Punctuation deleted rather than turned into a word boundary: an abbreviation dot
 * and an apostrophe join what they touch. `S.A.` has to become `sa` for the token
 * list to recognize it, and "O'Brien" has to become `obrien` so it matches the
 * source that wrote "OBrien".
 */
const JOINING_PUNCTUATION = /['\u2018\u2019\u02bc`\u00b4.]/g;

/** Everything else — including `&` — is a word boundary. */
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;

/** Removes trailing legal forms, repeatedly, longest phrase first. */
function stripLegalForms(words: readonly string[]): readonly string[] {
  let end = words.length;

  for (let changed = true; changed && end > 0;) {
    changed = false;

    for (const phrase of LEGAL_FORM_PHRASES) {
      const start = end - phrase.length;
      if (start >= 0 && phrase.every((word, i) => words[start + i] === word)) {
        end = start;
        changed = true;
        break;
      }
    }

    if (!changed && LEGAL_FORM_TOKENS.has(words[end - 1])) {
      end -= 1;
      changed = true;
    }
  }

  return words.slice(0, end);
}

/**
 * A company name as its canonical slug. Returns `''` for an absent name, which the
 * caller has to treat as "no company" rather than as a slug — a posting without an
 * employer cannot take part in company-partitioned deduplication.
 */
export function toCompanySlug(input: string | null | undefined): string {
  if (!input) {
    return '';
  }

  const words = foldToAscii(normalizePlainText(input))
    .replace(JOINING_PUNCTUATION, '')
    .replace(NON_ALPHANUMERIC, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return '';
  }

  const stripped = stripLegalForms(words);

  // A name that is *only* a legal form ("Limited", "GmbH") keeps it. Returning an
  // empty slug would partition every such company together, which is precisely the
  // collision this function exists to avoid.
  return (stripped.length > 0 ? stripped : words).join('-');
}
