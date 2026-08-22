/**
 * ASCII folding for canonical values (M6.2, `DATABASE.md` §6).
 *
 * `companySlug` and `countryCode` are compared across sources, so the same company
 * written two ways has to fold to one value. Sources disagree about diacritics
 * constantly: an ATS that lost its encoding writes "Muller GmbH", a German board
 * writes "Müller GmbH", and an English aggregator writes "Mueller GmbH". Folding
 * makes all three one slug.
 *
 * German-style expansion comes first and is the reason this is not a plain
 * combining-mark strip: `ü` folds to `ue`, not `u`, because "Mueller" is how the
 * name is actually transliterated in the wild. Stripping the mark instead would
 * produce `muller`, which matches neither of the other two spellings.
 *
 * This is a canonicalization input only. Display values keep their diacritics —
 * `companyName` and `location` are stored as the source wrote them.
 */

/**
 * Characters that transliterate to more than one ASCII letter, or that carry no
 * combining mark for NFD to strip (`ø`, `ł`, `đ` are single code points).
 */
const EXPANSIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/ä/g, 'ae'],
  [/ö/g, 'oe'],
  [/ü/g, 'ue'],
  [/ß/g, 'ss'],
  [/æ/g, 'ae'],
  [/œ/g, 'oe'],
  [/ø/g, 'o'],
  [/å/g, 'a'],
  [/ł/g, 'l'],
  [/đ/g, 'd'],
  [/ð/g, 'd'],
  [/þ/g, 'th'],
];

/** Combining marks left behind by NFD decomposition. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Lowercases and folds to ASCII. Not a slug: punctuation and whitespace are left
 * alone, because the callers disagree about what to do with them — a slug removes
 * them, a country lookup collapses them.
 */
export function foldToAscii(input: string): string {
  let text = input.toLowerCase();
  for (const [pattern, replacement] of EXPANSIONS) {
    text = text.replace(pattern, replacement);
  }
  return text.normalize('NFD').replace(COMBINING_MARKS, '');
}
