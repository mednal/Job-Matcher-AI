/**
 * Experience extraction (M8.1, `ARCHITECTURE.md` §6.4).
 *
 * The first half of stage 1's evidence: the **numeric** experience requirement a
 * posting states, in English and German, reduced to `minYears` / `maxYears`. Phrase
 * evidence ("entry level", "keine Berufserfahrung") is M8.2's; keeping the two apart
 * is what lets M8.3 implement §6.4's precedence rule — numeric beats phrase beats
 * title — instead of having to guess which kind of evidence a match was.
 *
 * Three decisions shape the implementation:
 *
 *  - **A number alone is never evidence.** "5+ years" inside "we have been building
 *    payments for 5+ years" is a company blurb, not a requirement. Every quantity
 *    therefore has to sit within a short window of an experience word
 *    (`experience`, `…erfahrung`, `praxis`) before it counts. That is the cheapest
 *    filter that removes team sizes, founding dates and notice periods, all of
 *    which are written with the same digits.
 *  - **Both language pattern sets always run.** §6.4 says the pattern set is
 *    selected by `JobPosting.language`, which is right for M8.2's phrases —
 *    "mehrjährige Berufserfahrung" has no English reading. It is wrong here: the
 *    two numeric sets are disjoint by construction, since each requires its own
 *    unit word (`years` against `Jahre`), so running both cannot produce a
 *    conflict, and German postings routinely state the requirement in English.
 *    Selecting by language would only lose matches.
 *  - **Verbatim excerpts, taken from the original text.** Every mention carries the
 *    exact slice that produced it, offset included, because M8.2 requires evidence
 *    to be verbatim and M8.3 has to show a user *why* a job was called experienced.
 *    Nothing here folds, lowercases or rewrites the input — matching is done with
 *    case-insensitive patterns over the text as received.
 *
 * The input is the normalized plain-text description (M6.1). HTML is not handled:
 * markup would put tags between a number and its unit, and `htmlToPlainText` has
 * already run by the time the classifier sees a posting.
 */

/** One numeric statement found in the text, with the excerpt that produced it. */
export interface ExperienceMention {
  /** Verbatim slice of the input, including the experience word that qualified it. */
  readonly text: string;
  /** Offset of `text` in the input. */
  readonly index: number;
  readonly minYears: number | null;
  readonly maxYears: number | null;
}

export interface ExperienceRequirement {
  readonly minYears: number | null;
  readonly maxYears: number | null;
  readonly mentions: readonly ExperienceMention[];
}

interface Bounds {
  readonly minYears: number | null;
  readonly maxYears: number | null;
}

/**
 * Anything above this is a typo, a founding year or a phone number, not a
 * requirement. It matches the `Profile.yearsOfExperience BETWEEN 0 AND 60` CHECK of
 * `DATABASE.md` §5, so both sides of the eventual profile-fit comparison agree on
 * what a plausible number of years is.
 */
const MAX_PLAUSIBLE_YEARS = 60;

/**
 * Spelled-out numbers. `ein`/`eine`/`einem`/`einer` are deliberately absent: they are
 * the German indefinite article far more often than the numeral, and "seit einem Jahr
 * am Markt" would otherwise read as a one-year requirement. English `one` has no such
 * second job and is kept.
 */
const NUMBER_WORDS: ReadonlyMap<string, number> = new Map<string, number>([
  ['zero', 0],
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
  ['null', 0],
  ['zwei', 2],
  ['drei', 3],
  ['vier', 4],
  ['fünf', 5],
  ['fuenf', 5],
  ['sechs', 6],
  ['sieben', 7],
  ['acht', 8],
  ['neun', 9],
  ['zehn', 10],
]);

const NUMBER = `(?:\\d{1,2}|${[...NUMBER_WORDS.keys()].join('|')})`;

/** `year`, `years`, `yrs`, `Jahr`, `Jahre`, `Jahren`, `Jahres`. */
const UNIT = `(?:years?|yrs?\\.?|jahre[ns]?|jahr)`;

/**
 * Unicode-aware word boundaries. `\b` is ASCII-only, so `\büber` can never match: `ü`
 * is not a word character, and a boundary in front of it would need one behind it.
 * Several patterns here begin or end on an umlaut, so the boundaries are written out.
 */
const LEFT = `(?<![\\p{L}\\p{N}])`;
const RIGHT = `(?![\\p{L}\\p{N}])`;

interface QuantityPattern {
  readonly pattern: RegExp;
  readonly bounds: (groups: readonly (string | undefined)[]) => Bounds | null;
}

function parseNumber(token: string | undefined): number | null {
  if (token === undefined) {
    return null;
  }

  const value = /^\d{1,2}$/.test(token)
    ? Number(token)
    : (NUMBER_WORDS.get(token.toLowerCase()) ?? null);

  return value === null || value > MAX_PLAUSIBLE_YEARS ? null : value;
}

/**
 * The patterns, in precedence order. An earlier pattern claims its span and a later
 * one overlapping a claimed span is dropped — which is how "at least 5 years" is read
 * as a floor rather than as the exact "5 years" sitting inside it. The bare quantity
 * is therefore last.
 */
const QUANTITY_PATTERNS: readonly QuantityPattern[] = [
  // 0-1 years · 0–2 years · 1 to 3 years · 1 bis 3 Jahre
  {
    pattern: new RegExp(
      `${LEFT}(${NUMBER})\\s*(?:[-–—]|to|bis)\\s*(${NUMBER})\\s*${UNIT}${RIGHT}`,
      'giu',
    ),
    bounds: (groups) => {
      const first = parseNumber(groups[1]);
      const second = parseNumber(groups[2]);
      if (first === null || second === null) {
        return null;
      }
      // Written backwards ("2-0 years") is a typo, not a second meaning.
      return {
        minYears: Math.min(first, second),
        maxYears: Math.max(first, second),
      };
    },
  },
  // at least 5 years · minimum of 3 years · mindestens 3 Jahre · ab 3 Jahren
  {
    pattern: new RegExp(
      `${LEFT}(?:at least|a minimum of|minimum of|minimum|min\\.|more than|over|mindestens|mind\\.|ab|mehr als|länger als|laenger als|über|ueber)\\s+(${NUMBER})\\s*\\+?\\s*${UNIT}${RIGHT}`,
      'giu',
    ),
    bounds: (groups) => {
      const value = parseNumber(groups[1]);
      // "more than 3 years" is recorded as a floor of 3, not 4. The understatement
      // is the junior-friendly direction, and no classification band splits at the
      // difference between the two readings.
      return value === null ? null : { minYears: value, maxYears: null };
    },
  },
  // 3+ years · 8 + Jahre
  {
    pattern: new RegExp(`${LEFT}(${NUMBER})\\s*\\+\\s*${UNIT}${RIGHT}`, 'giu'),
    bounds: (groups) => {
      const value = parseNumber(groups[1]);
      return value === null ? null : { minYears: value, maxYears: null };
    },
  },
  // 5 years or more · 5 Jahre und mehr
  {
    pattern: new RegExp(
      `${LEFT}(${NUMBER})\\s*${UNIT}\\s*(?:or more|and more|or above|oder mehr|und mehr|aufwärts|aufwaerts)${RIGHT}`,
      'giu',
    ),
    bounds: (groups) => {
      const value = parseNumber(groups[1]);
      return value === null ? null : { minYears: value, maxYears: null };
    },
  },
  // up to 2 years · less than 2 years · maximal 2 Jahre · bis zu 2 Jahren
  {
    pattern: new RegExp(
      `${LEFT}(?:up to|no more than|not more than|less than|fewer than|under|bis zu|bis maximal|maximal|max\\.|höchstens|hoechstens|weniger als)\\s+(${NUMBER})\\s*${UNIT}${RIGHT}`,
      'giu',
    ),
    bounds: (groups) => {
      const value = parseNumber(groups[1]);
      return value === null ? null : { minYears: null, maxYears: value };
    },
  },
  // 2 years of experience · 0 Jahre Berufserfahrung
  {
    pattern: new RegExp(`${LEFT}(${NUMBER})\\s*${UNIT}${RIGHT}`, 'giu'),
    bounds: (groups) => {
      const value = parseNumber(groups[1]);
      return value === null ? null : { minYears: value, maxYears: value };
    },
  },
];

/**
 * The words that turn a quantity into a requirement. `[\p{L}]*erfahrung` is what
 * catches the German compounds — `Berufserfahrung`, `Praxiserfahrung`,
 * `Programmiererfahrung` — without listing them.
 */
const EXPERIENCE_WORD = /(?:experience|[\p{L}]*erfahrung|praxis)/iu;

/**
 * How far from the quantity the experience word may sit. 40 characters covers the
 * phrasings that occur ("years of hands-on professional experience" is 33) without
 * reaching across a paragraph — the window is also cut at the first line break,
 * because M6.1 leaves paragraph breaks in place and a number in one paragraph is not
 * qualified by a word in the next.
 */
const CONTEXT_WINDOW_CHARS = 40;

interface Span {
  readonly start: number;
  readonly end: number;
}

/**
 * The span covering the quantity together with the experience word that qualifies
 * it, or null when no such word is near enough. Both sides are searched because
 * German needs it: "Berufserfahrung von mindestens 3 Jahren" puts the word first,
 * "3 Jahre Berufserfahrung" puts it last.
 */
function qualifyingSpan(text: string, match: Span): Span | null {
  const after = text
    .slice(match.end, match.end + CONTEXT_WINDOW_CHARS)
    .split('\n')[0];
  const afterMatch = EXPERIENCE_WORD.exec(after);
  if (afterMatch) {
    return {
      start: match.start,
      end: match.end + afterMatch.index + afterMatch[0].length,
    };
  }

  const window = text.slice(
    Math.max(0, match.start - CONTEXT_WINDOW_CHARS),
    match.start,
  );
  const before = window.slice(window.lastIndexOf('\n') + 1);
  // The last occurrence is the nearest one, so the excerpt stays tight.
  let nearest: RegExpMatchArray | null = null;
  for (const candidate of before.matchAll(
    new RegExp(EXPERIENCE_WORD.source, 'giu'),
  )) {
    nearest = candidate;
  }
  if (nearest?.index !== undefined) {
    return {
      start: match.start - (before.length - nearest.index),
      end: match.end,
    };
  }

  return null;
}

function overlaps(span: Span, claimed: readonly Span[]): boolean {
  return claimed.some(
    (other) => span.start < other.end && other.start < span.end,
  );
}

/**
 * Collapses the mentions into the single pair the schema stores
 * (`JobClassification.minYears` / `maxYears`, `Job.requiredMinYears` /
 * `requiredMaxYears`).
 *
 * `minYears` is the **highest** floor stated anywhere in the text. A posting that
 * offers "0-2 years" in one paragraph and demands "5+ years" in another is the
 * adversarial case this product exists to catch, and the strictest requirement is
 * the honest reading of it. `maxYears` gives way to any open-ended floor, because a
 * ceiling and an unbounded requirement cannot both be true and the unbounded one is
 * what excludes a junior.
 *
 * The result can never violate the `minYears <= maxYears` CHECK of `DATABASE.md` §5:
 * a computed ceiling below the floor is dropped rather than stored.
 */
function aggregate(mentions: readonly ExperienceMention[]): Bounds {
  const floors = mentions
    .map((mention) => mention.minYears)
    .filter((value): value is number => value !== null);
  const minYears = floors.length > 0 ? Math.max(...floors) : null;

  const openEnded = mentions.some(
    (mention) => mention.minYears !== null && mention.maxYears === null,
  );
  const ceilings = mentions
    .map((mention) => mention.maxYears)
    .filter((value): value is number => value !== null);

  let maxYears =
    openEnded || ceilings.length === 0 ? null : Math.max(...ceilings);
  if (minYears !== null && maxYears !== null && maxYears < minYears) {
    maxYears = null;
  }

  return { minYears, maxYears };
}

/**
 * Reads the numeric experience requirement out of a normalized description.
 *
 * Returns `{ minYears: null, maxYears: null, mentions: [] }` when the posting states
 * no number — a real answer, not a failure: "the posting does not say" is exactly
 * the input that makes M8.3 fall back to phrase evidence.
 */
export function extractExperience(
  text: string | null | undefined,
): ExperienceRequirement {
  if (!text) {
    return { minYears: null, maxYears: null, mentions: [] };
  }

  const claimed: Span[] = [];
  const mentions: ExperienceMention[] = [];

  for (const { pattern, bounds } of QUANTITY_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) {
        continue;
      }

      const span: Span = {
        start: match.index,
        end: match.index + match[0].length,
      };
      if (overlaps(span, claimed)) {
        continue;
      }

      const parsed = bounds(match);
      if (parsed === null) {
        continue;
      }

      const qualified = qualifyingSpan(text, span);
      if (qualified === null) {
        continue;
      }

      claimed.push(span);
      mentions.push({
        text: text.slice(qualified.start, qualified.end),
        index: qualified.start,
        minYears: parsed.minYears,
        maxYears: parsed.maxYears,
      });
    }
  }

  mentions.sort((a, b) => a.index - b.index);
  return { ...aggregate(mentions), mentions };
}
