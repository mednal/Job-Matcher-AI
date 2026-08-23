import type { ExperienceMention, ExperienceRequirement } from './experience';
import { matchPhraseSignals } from './phrase-signals';
import {
  createSignal,
  isPositive,
  type Signal,
  type SignalCode,
} from './signal';

/**
 * Signal extraction (M8.2, `ARCHITECTURE.md` §6.4).
 *
 * Turns one posting into the two evidence lists `JobClassification` stores. There are
 * exactly two sources of evidence and they are combined here rather than mixed
 * together earlier:
 *
 *  - **Numeric**, from M8.1's `extractExperience`. One signal at most, because the
 *    posting states one requirement however many times it says it.
 *  - **Phrase**, from `matchPhraseSignals`. One signal per code.
 *
 * Three rules govern the result.
 *
 * **No signal is emitted without a verbatim excerpt.** A signal whose `evidence` is
 * empty is a claim with nothing behind it — it would still move the score, and there
 * would be no way to see why. That is why the numeric signal is derived from a
 * *mention* rather than from the aggregate bounds: an aggregate has no offset, and
 * `extractExperience` returning bounds with no mentions is not a case that can happen,
 * but if it ever did the honest answer is no signal rather than an invented quote.
 *
 * **The numeric signal comes first in its list.** §6.4's precedence is numeric beats
 * phrase beats title, and M8.3 implements that; putting the number first means the
 * evidence a user reads is ordered the same way the classifier weighed it.
 *
 * **The title is not read here.** §6.4 makes the title one input among many and
 * M8.3 owns the rule that it never decides alone, so the title is that milestone's
 * input, not this one's. Matching phrases in it as well would double-count a posting
 * whose title repeats its own body ("Entry Level Developer — this is an entry level
 * position") and give the title a vote it is not supposed to have.
 */

/** The two evidence lists, in the shape `JobClassification` stores them. */
export interface ExtractedSignals {
  readonly positive: readonly Signal[];
  readonly negative: readonly Signal[];
}

export interface SignalExtractionInput {
  /** The normalized plain-text description (M6.1). */
  readonly description?: string | null;
  /** The numeric requirement M8.1 already read out of that description. */
  readonly experience?: ExperienceRequirement | null;
}

/** A floor at or above this is the strongest negative evidence a posting can carry. */
const CLEARLY_EXPERIENCED_FLOOR_YEARS = 5;

/** `CLAUDE.md`'s negative list starts at "3+ years"; so does this. */
const EXPERIENCED_FLOOR_YEARS = 3;

/** The upper edge of the band this product is built for: roughly 0–2 years. */
const JUNIOR_CEILING_YEARS = 2;

/**
 * The exact ranges worth naming. Anything else that fits under the junior ceiling
 * falls back to `UP_TO_TWO_YEARS`, so a posting asking for "up to 18 months" still
 * produces evidence rather than nothing.
 */
const RANGE_CODES: ReadonlyMap<string, SignalCode> = new Map([
  ['0-1', 'ZERO_TO_ONE_YEARS'],
  ['0-2', 'ZERO_TO_TWO_YEARS'],
  ['1-2', 'ONE_TO_TWO_YEARS'],
]);

/**
 * The codes `numericSignal` can emit, so M8.3 can tell the two kinds of evidence
 * apart in a finished list. §6.4's precedence rule needs that: the classifier weighs
 * phrase evidence *within* the side the figure chose, which means it has to be able
 * to leave the figure's own signal out of that sum. The set is derived from the
 * mapping above rather than written out again, and a spec asserts nothing else ever
 * comes out of this file's numeric half.
 */
export const NUMERIC_SIGNAL_CODES: ReadonlySet<SignalCode> =
  new Set<SignalCode>([
    ...RANGE_CODES.values(),
    'UP_TO_TWO_YEARS',
    'REQUIRES_3_PLUS_YEARS',
    'REQUIRES_5_PLUS_YEARS',
  ]);

/**
 * The mention that produced the aggregate floor — the highest one stated anywhere,
 * which is the reading `aggregate` in `experience.ts` takes and the reason the
 * "0-2 years … but 5+ years" posting is caught.
 */
function floorMention(
  experience: ExperienceRequirement,
): ExperienceMention | undefined {
  return experience.mentions.find(
    (mention) => mention.minYears === experience.minYears,
  );
}

/**
 * The mention that produced the aggregate range. Both bounds have to come from one
 * mention for it to be the quote: a range assembled from a floor in one paragraph and
 * a ceiling in another is not a sentence anybody wrote.
 */
function rangeMention(
  experience: ExperienceRequirement,
): ExperienceMention | undefined {
  return experience.mentions.find(
    (mention) =>
      mention.minYears === experience.minYears &&
      mention.maxYears === experience.maxYears,
  );
}

/**
 * A ceiling with no floor stays `UP_TO_TWO_YEARS`: "up to 2 years" is not the same
 * claim as "0-2 years", and reading the missing floor as a stated zero would quote a
 * range the posting never wrote.
 */
function rangeCode(minYears: number | null, maxYears: number): SignalCode {
  if (minYears === null) {
    return 'UP_TO_TWO_YEARS';
  }
  return RANGE_CODES.get(`${minYears}-${maxYears}`) ?? 'UP_TO_TWO_YEARS';
}

/**
 * The one signal the numeric requirement is worth, or `null` when the posting states
 * no figure or states one that is evidence for neither side.
 *
 * A range like "1 to 4 years" is deliberately silent: its floor is below the
 * experienced threshold and its ceiling is above the junior one, so it says only that
 * the employer has not decided. Inventing a signal for it would put a number on a
 * shrug.
 */
function numericSignal(
  experience: ExperienceRequirement | null | undefined,
): Signal | null {
  if (!experience) {
    return null;
  }

  const { minYears, maxYears } = experience;

  if (minYears !== null && minYears >= EXPERIENCED_FLOOR_YEARS) {
    const mention = floorMention(experience);
    if (!mention) {
      return null;
    }
    return createSignal(
      minYears >= CLEARLY_EXPERIENCED_FLOOR_YEARS
        ? 'REQUIRES_5_PLUS_YEARS'
        : 'REQUIRES_3_PLUS_YEARS',
      mention.text,
    );
  }

  if (maxYears !== null && maxYears <= JUNIOR_CEILING_YEARS) {
    const mention = rangeMention(experience);
    if (!mention) {
      return null;
    }
    return createSignal(rangeCode(minYears, maxYears), mention.text);
  }

  return null;
}

/**
 * Every signal a posting carries, split by polarity.
 *
 * Both lists may be empty — a posting that states nothing about who it is for is a
 * real and common answer, and the input that makes M8.3 return `AMBIGUOUS` rather
 * than guessing.
 */
export function extractSignals(input: SignalExtractionInput): ExtractedSignals {
  const signals: Signal[] = [];

  const numeric = numericSignal(input.experience);
  if (numeric !== null) {
    signals.push(numeric);
  }

  for (const match of matchPhraseSignals(input.description)) {
    if (match.evidence.length === 0) {
      continue;
    }
    signals.push(createSignal(match.code, match.evidence));
  }

  return {
    positive: signals.filter((signal) => isPositive(signal.code)),
    negative: signals.filter((signal) => !isPositive(signal.code)),
  };
}
