import { foldToAscii } from '../../common/utils/ascii-fold';

/**
 * `normalizedTitle` — the canonical title form of dedup tiers 2 and 3
 * (M7.2, `ARCHITECTURE.md` §6.3, `DATABASE.md` §6).
 *
 * The rule is stated in three places and is the same one: **lowercased, seniority
 * words, `(m/f/d)`-style markers and punctuation removed**. It is stored on `Job`
 * rather than only hashed, because tier 3 runs trigram similarity against it.
 *
 * Versioned with the deduplication logic. **Changing this function invalidates
 * every stored `dedupHash`** and needs the recompute migration of `DATABASE.md` §6 —
 * which is one of the reasons `RawJobDocument` is retained.
 *
 * ---
 *
 * **Recorded hazard — stripping seniority can merge two real vacancies.**
 * `dedupHash` is `UNIQUE` (D1), so once "Junior Java Developer" and "Senior Java
 * Developer" at one company in one country both normalize to `java developer`, the
 * database *cannot* hold them as two canonical jobs: the second posting attaches to
 * the first one's `Job`. For a product whose entire value is telling entry-level
 * roles apart from experienced ones, that is the expensive direction of error — the
 * one `ARCHITECTURE.md` §6.3 says to avoid by preferring a false split.
 *
 * It is implemented as specified anyway, deliberately: the rule is written into
 * `ARCHITECTURE.md` §6.3, `DATABASE.md` §6 and this milestone, and the seeded
 * corpus already encodes it (`Junior Backend Developer (Java)` is seeded as
 * `backend developer java`, `Lead Platform Engineer` as `platform engineer`).
 * Changing it is a product decision plus a recompute migration, not a detail to
 * settle inside this file. The mitigation available without either is to keep the
 * list below **short** — every word added to it is another pair of distinct
 * vacancies the schema can no longer represent.
 */

/**
 * Seniority modifiers. Only words that modify a role's level, never words that name
 * the role or the hiring programme.
 *
 * Deliberately *not* in this list, and load-bearing:
 *  - `graduate`, `absolvent`, `trainee`, `praktikant`, `werkstudent`, `intern` —
 *    these are the role, not a level. The seed corpus keeps `Graduate Software
 *    Engineer` as `graduate software engineer`; folding it into `software engineer`
 *    would merge a graduate programme with an open-level vacancy.
 *  - `head`, `manager`, `director`, `chief` — part of a job title, not a modifier.
 *    Stripping them turns "Head of Engineering" into "of engineering".
 *  - Roman numerals (`Engineer II`), because they are a ladder rank like junior and
 *    senior and stripping them collapses the whole ladder onto one row. The specs
 *    do not ask for them.
 */
const SENIORITY_WORDS: ReadonlySet<string> = new Set([
  // English
  'junior',
  'jr',
  'jnr',
  'senior',
  'sr',
  'snr',
  'lead',
  'principal',
  'staff',
  // German. `leitend` in its declined forms; `junior`/`senior` are used unchanged.
  'leitender',
  'leitende',
  'leitendes',
]);

/**
 * Tokens that may appear inside a gender marker. A bracketed group or a
 * slash-joined run is dropped only when **every** token is in here and at least one
 * is a `GENDER_CORE` token — so `(m/w/d)`, `(all genders)` and `w/m/x` go, while
 * `(Java)` and `C/C++` stay.
 */
const GENDER_TOKENS: ReadonlySet<string> = new Set([
  'm',
  'w',
  'f',
  'd',
  'x',
  'n',
  'h',
  'g',
  'gn',
  'v',
  'divers',
  'diverse',
  'gender',
  'genders',
  'geschlecht',
  'geschlechter',
  'all',
  'alle',
  'any',
  'jede',
  'jeder',
  'neutral',
  'und',
  'and',
  'or',
  'oder',
  'egal',
]);

/** At least one of these must be present, so a stray `(and)` is not a marker. */
const GENDER_CORE: ReadonlySet<string> = new Set([
  'm',
  'w',
  'f',
  'd',
  'x',
  'gn',
  'divers',
  'diverse',
  'gender',
  'genders',
  'geschlecht',
  'geschlechter',
]);

function isGenderMarker(inner: string): boolean {
  const tokens = inner.split(/[^a-z0-9]+/).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return false;
  }
  return (
    tokens.every((token) => GENDER_TOKENS.has(token)) &&
    tokens.some((token) => GENDER_CORE.has(token))
  );
}

/** `(m/w/d)`, `[m/f/d]`, `(all genders)` — the bracketed spelling. */
const BRACKETED = /[([{]([^)\]}]*)[)\]}]/g;

/**
 * The unbracketed spelling: `Developer m/w/d`, `Entwickler w|m|d`. Anchored on a
 * one-or-two letter first token so `Frontend/Backend` cannot match — its first
 * segment is longer than the marker letters ever are.
 */
const SLASH_RUN = /\b[a-z]{1,2}(?:\s*[/|]\s*[a-z]{1,12}){1,3}\b/g;

function stripGenderMarkers(folded: string): string {
  return folded
    .replace(BRACKETED, (whole, inner: string) =>
      isGenderMarker(inner) ? ' ' : whole,
    )
    .replace(SLASH_RUN, (whole) => (isGenderMarker(whole) ? ' ' : whole));
}

/**
 * A posting title as its canonical dedup form.
 *
 * The input is expected to be an already normalized plain-text title (M6.1) — this
 * function canonicalizes, it does not strip markup.
 *
 * Word order is preserved: `Softwareentwickler (m/w/d) Backend` becomes
 * `softwareentwickler backend`, not a sorted bag. Two sources listing the same
 * vacancy write the words in the same order; sorting would additionally merge
 * "Developer Support" with "Support Developer", which are different jobs.
 *
 * Returns `''` for an absent or punctuation-only title. The caller must treat that
 * as "no title" rather than as a value to hash — tier 1 already refuses a posting
 * without one, since tiers 2 and 3 would have nothing to match on.
 */
export function toNormalizedTitle(input: string | null | undefined): string {
  if (!input) {
    return '';
  }

  // Fold first: the marker and seniority tables are written in ASCII, so
  // "Softwareentwickler (m/w/d)" and a mis-encoded "Fachinformatiker fuer ..."
  // compare against them on equal terms.
  const folded = foldToAscii(input);

  const words = stripGenderMarkers(folded)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return '';
  }

  const stripped = words.filter((word) => !SENIORITY_WORDS.has(word));

  // A title that is *only* seniority words ("Senior", "Junior (m/w/d)") keeps them.
  // An empty normalized title would hash every such posting at a company onto one
  // `dedupHash`, which is the collision this whole file is trying not to cause.
  return (stripped.length > 0 ? stripped : words).join(' ');
}
