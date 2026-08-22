import { foldToAscii } from '../../common/utils/ascii-fold';
import { normalizePlainText } from './text-normalization';

/**
 * Location parsing (M6.2, `ARCHITECTURE.md` §6.2).
 *
 * Sources write one free-text location field and mean a dozen different things by
 * it: "Berlin, Germany", "Berlin (DE)", "Remote - Deutschland", "München". Two
 * values come out of it, and they are used very differently.
 *
 *  - `countryCode` is a **canonical** value (`DATABASE.md` §6): ISO-3166 alpha-2,
 *    uppercase, `CHAR(2)`. It backs the country facet and is a component of
 *    `dedupHash`.
 *  - `location` is a **display** value. It keeps the source's own spelling and
 *    diacritics; nothing compares it.
 *
 * The one judgement call worth stating: **a city is never mapped to a country.**
 * "Berlin" alone yields a null `countryCode`, not `DE`. A city dictionary buys a
 * slightly better facet and risks a wrong country on exactly the ambiguous names
 * that matter here (Frankfurt, Cambridge, Birmingham, Berlin itself), and a wrong
 * country is baked into `dedupHash`, where it merges or splits real vacancies. The
 * cost is a false split when one board writes "Berlin, Germany" and another writes
 * "Berlin"; dedup tier 3 exists for that case — it matches on `companySlug` and
 * title similarity and never looks at the country (§6.3).
 *
 * Workplace type is **not** detected here. "Remote" stays in `location` verbatim
 * for M6.3 to read; splitting that decision across two milestones would leave two
 * places deciding what remote means.
 */

export interface ParsedLocation {
  /** Display value, source spelling preserved. Null when nothing but a country. */
  location: string | null;
  /** ISO-3166 alpha-2, uppercase. Null when the source did not state a country. */
  countryCode: string | null;
}

/**
 * Country names, ISO alpha-2 and alpha-3 codes, and the spellings actually seen in
 * job postings, in English and German. Keys are written naturally and folded at
 * load, so an accented spelling only needs to appear once.
 *
 * Deliberately not an exhaustive ISO table: this is the set the MVP's sources can
 * plausibly return, and an unknown value falls back to a null country rather than a
 * guess. Constituent countries of the UK map to `GB`, which is the ISO code.
 */
const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  germany: 'DE',
  deutschland: 'DE',
  de: 'DE',
  deu: 'DE',
  austria: 'AT',
  österreich: 'AT',
  at: 'AT',
  aut: 'AT',
  switzerland: 'CH',
  schweiz: 'CH',
  suisse: 'CH',
  ch: 'CH',
  che: 'CH',
  'united kingdom': 'GB',
  'great britain': 'GB',
  uk: 'GB',
  gb: 'GB',
  gbr: 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'northern ireland': 'GB',
  ireland: 'IE',
  irland: 'IE',
  ie: 'IE',
  irl: 'IE',
  netherlands: 'NL',
  'the netherlands': 'NL',
  niederlande: 'NL',
  nl: 'NL',
  nld: 'NL',
  belgium: 'BE',
  belgien: 'BE',
  be: 'BE',
  bel: 'BE',
  luxembourg: 'LU',
  luxemburg: 'LU',
  lu: 'LU',
  lux: 'LU',
  france: 'FR',
  frankreich: 'FR',
  fr: 'FR',
  fra: 'FR',
  spain: 'ES',
  spanien: 'ES',
  españa: 'ES',
  es: 'ES',
  esp: 'ES',
  portugal: 'PT',
  pt: 'PT',
  prt: 'PT',
  italy: 'IT',
  italien: 'IT',
  italia: 'IT',
  it: 'IT',
  ita: 'IT',
  poland: 'PL',
  polen: 'PL',
  polska: 'PL',
  pl: 'PL',
  pol: 'PL',
  czechia: 'CZ',
  'czech republic': 'CZ',
  tschechien: 'CZ',
  cz: 'CZ',
  cze: 'CZ',
  slovakia: 'SK',
  sk: 'SK',
  svk: 'SK',
  hungary: 'HU',
  ungarn: 'HU',
  hu: 'HU',
  hun: 'HU',
  romania: 'RO',
  rumänien: 'RO',
  ro: 'RO',
  rou: 'RO',
  bulgaria: 'BG',
  bg: 'BG',
  bgr: 'BG',
  greece: 'GR',
  griechenland: 'GR',
  gr: 'GR',
  grc: 'GR',
  croatia: 'HR',
  hr: 'HR',
  hrv: 'HR',
  slovenia: 'SI',
  si: 'SI',
  svn: 'SI',
  serbia: 'RS',
  rs: 'RS',
  srb: 'RS',
  ukraine: 'UA',
  ua: 'UA',
  ukr: 'UA',
  sweden: 'SE',
  schweden: 'SE',
  sverige: 'SE',
  se: 'SE',
  swe: 'SE',
  norway: 'NO',
  norwegen: 'NO',
  norge: 'NO',
  no: 'NO',
  nor: 'NO',
  denmark: 'DK',
  dänemark: 'DK',
  danmark: 'DK',
  dk: 'DK',
  dnk: 'DK',
  finland: 'FI',
  finnland: 'FI',
  suomi: 'FI',
  fi: 'FI',
  fin: 'FI',
  estonia: 'EE',
  ee: 'EE',
  est: 'EE',
  latvia: 'LV',
  lv: 'LV',
  lva: 'LV',
  lithuania: 'LT',
  lt: 'LT',
  ltu: 'LT',
  'united states': 'US',
  'united states of america': 'US',
  usa: 'US',
  us: 'US',
  canada: 'CA',
  kanada: 'CA',
  ca: 'CA',
  can: 'CA',
  australia: 'AU',
  au: 'AU',
  aus: 'AU',
  'new zealand': 'NZ',
  nz: 'NZ',
  nzl: 'NZ',
  india: 'IN',
  indien: 'IN',
  in: 'IN',
  ind: 'IN',
  turkey: 'TR',
  türkiye: 'TR',
  tr: 'TR',
  tur: 'TR',
};

/**
 * The comparison form of a segment: folded to ASCII with every non-alphanumeric
 * character dropped, so `U.S.A.`, `USA` and `u s a` are one key.
 */
function lookupKey(segment: string): string {
  return foldToAscii(segment).replace(/[^a-z0-9]+/g, '');
}

const COUNTRY_BY_KEY: ReadonlyMap<string, string> = new Map<string, string>(
  Object.entries(COUNTRY_ALIASES).map(
    ([alias, code]) => [lookupKey(alias), code] as const,
  ),
);

/**
 * Separators sources use between the parts of a location. Brackets and pipes become
 * commas so "Remote (Germany)" splits like "Remote, Germany"; a dash separates only
 * when it is spaced, so "Baden-Württemberg" stays intact.
 */
const BRACKETS_AND_PIPES = /[()[\]|]/g;
const SPACED_DASH = /\s[-–—]\s/g;
const SLASH = /\s*\/\s*/g;

/**
 * Splits a source's free-text location into a display value and a country code.
 *
 * The country is matched from the **right**, because that is where sources put it,
 * and only the first match is consumed: in "Germany, Austria" the trailing segment
 * wins and the other stays in the display value rather than being silently dropped.
 */
export function parseLocation(
  input: string | null | undefined,
): ParsedLocation {
  const text = normalizePlainText(input ?? '');
  if (!text) {
    return { location: null, countryCode: null };
  }

  const segments = text
    .replace(BRACKETS_AND_PIPES, ',')
    .replace(SPACED_DASH, ',')
    .replace(SLASH, ',')
    .split(/[,\n]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  let countryCode: string | null = null;
  const kept: string[] = [];

  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i];

    if (countryCode === null) {
      const code: string | undefined = COUNTRY_BY_KEY.get(lookupKey(segment));
      if (code !== undefined) {
        countryCode = code;
        continue;
      }
    }

    kept.unshift(segment);
  }

  return {
    location: kept.length > 0 ? kept.join(', ') : null,
    countryCode,
  };
}
