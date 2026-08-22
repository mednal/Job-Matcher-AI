import { foldToAscii } from '../../common/utils/ascii-fold';

/**
 * Phrase matching for the attribute detectors (M6.3, `ARCHITECTURE.md` §6.2).
 *
 * Workplace type and employment type are both decided by looking for a small set of
 * fixed phrases in English and German. Two problems make a naive `includes()` wrong,
 * and both are solved here once rather than in each detector.
 *
 *  - **Spelling variance.** Sources write "full-time", "full time" and "Full Time";
 *    German sources write "Präsenz" and, when an encoding was lost somewhere
 *    upstream, "Praesenz". Haystack *and* phrase go through the same folding, so a
 *    phrase is written once, naturally, and matches every spelling of itself.
 *  - **Substring collisions.** "no remote work" contains "remote"; "interne
 *    Prozesse" contains "intern". Matching is token-aligned, and a match close
 *    behind a negator does not count.
 *
 * This is deliberately not the technology matcher: `technologies.ts` needs `c#`,
 * `.net` and `node.js` to survive, and the normalization here destroys exactly those
 * characters.
 */

/**
 * Folds to ASCII and reduces everything that is not a letter or digit to a single
 * space, so the result is a sequence of space-delimited tokens. "Full-time (m/w/d)"
 * and "full time m w d" become the same string, and phrase boundaries can then be
 * plain spaces.
 */
export function normalizeForPhraseMatch(
  ...parts: ReadonlyArray<string | null | undefined>
): string {
  const joined = parts.filter((part) => Boolean(part)).join(' ');
  return foldToAscii(joined)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One global pattern matching any of `phrases` on token boundaries. The phrases are
 * folded with the haystack's own normalizer, so `phrasePattern(['Präsenz'])` matches
 * text that was written either way.
 *
 * The leading boundary is consumed and the trailing one is a lookahead, so two
 * adjacent phrases both match rather than the first eating the second's boundary.
 */
export function phrasePattern(phrases: readonly string[]): RegExp {
  const alternatives = phrases
    .map((phrase) => normalizeForPhraseMatch(phrase))
    .filter((phrase) => phrase.length > 0)
    .map(escapeRegExp)
    .join('|');

  return new RegExp(`(?:^| )(?:${alternatives})(?= |$)`, 'g');
}

/**
 * Words that flip the meaning of a phrase that follows them: "no remote work",
 * "keine Berufserfahrung", "this is not an internship".
 */
const NEGATORS: ReadonlySet<string> = new Set([
  'no',
  'not',
  'never',
  'without',
  'kein',
  'keine',
  'keinen',
  'keiner',
  'nicht',
  'ohne',
]);

/**
 * How many tokens before a match are inspected for a negator. Three covers the
 * phrasings that actually occur ("no", "there is no", "we do not offer") without
 * reaching back into the previous sentence — sentence boundaries are gone by the
 * time text is normalized, so the window is the only limit there is.
 */
const NEGATION_WINDOW_TOKENS = 3;

function isNegated(text: string, matchIndex: number): boolean {
  const preceding = text.slice(0, matchIndex).trim();
  if (preceding.length === 0) {
    return false;
  }

  return preceding
    .split(' ')
    .slice(-NEGATION_WINDOW_TOKENS)
    .some((token) => NEGATORS.has(token));
}

/**
 * True when `pattern` matches at least once without a negator in front of it.
 *
 * Every occurrence is checked, not only the first: a description that says "no
 * remote work in the first year" early and "remote afterwards" later still counts as
 * remote evidence, which is the reading a candidate would give it.
 */
export function matchesUnnegated(text: string, pattern: RegExp): boolean {
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index !== undefined && !isNegated(text, match.index)) {
      return true;
    }
  }
  return false;
}
