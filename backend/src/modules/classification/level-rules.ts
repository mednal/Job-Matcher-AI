import type { JuniorLevel } from '@prisma/client';
import type { Signal, SignalCode } from './signal';
import { NUMERIC_SIGNAL_CODES } from './signals';

/**
 * The rules that turn evidence into a `JuniorLevel` (M8.3, `ARCHITECTURE.md` §6.4).
 *
 * Pure, so it is unit-testable with no container, and separate from the classifier
 * for the same reason `experience.ts` is separate from its service: the decision is
 * the part that will be argued with, and it should be readable on its own.
 *
 * §6.4's precedence — **numeric evidence beats phrase evidence beats title** — is
 * the structure of this file, not a weighting inside it. Each kind of evidence gets
 * its turn only when the stronger kind has nothing decisive to say:
 *
 *  1. A stated floor of three years or more settles the posting on the experienced
 *     side, whatever else it says. This is the rule the product exists for: the
 *     "Junior Java Developer" whose body demands `5+ years` comes out
 *     `CLEARLY_EXPERIENCED` and never reaches a junior search.
 *  2. A stated ceiling of two years or less settles it on the junior side. Negative
 *     phrases can *demote within* that side — as far as `AMBIGUOUS` — but cannot
 *     carry it across, because that would be phrase evidence beating a number.
 *  3. With no decisive figure, the phrase weights band it.
 *  4. Only if all of that comes out `AMBIGUOUS` is the title read, and then only for
 *     one step. A title can never produce `ENTRY_LEVEL` or `CLEARLY_EXPERIENCED`.
 *
 * **The two sides are not symmetric, on purpose.** Negative phrases can pull a
 * junior figure down to `AMBIGUOUS`, but positive phrases cannot pull an experienced
 * figure back up at all. The failure this product exists to prevent is a junior
 * applying to a job that wants five years; the reverse costs a user one scroll. The
 * asymmetry also follows from M8.1, where the aggregate floor is the *highest* one
 * stated anywhere: by the time a floor of five reaches this file, five years is the
 * strictest thing the posting said about itself.
 */

/** A floor at or above this is the strongest negative evidence a posting can carry. */
const CLEARLY_EXPERIENCED_FLOOR_YEARS = 5;

/** `CLAUDE.md`'s negative list starts at "3+ years"; so does this. */
const EXPERIENCED_FLOOR_YEARS = 3;

/** The upper edge of the band this product is built for: roughly 0–2 years. */
const JUNIOR_CEILING_YEARS = 2;

/**
 * `ENTRY_LEVEL` is a claim that the posting is open to someone with no professional
 * experience at all, and only these say that outright: three phrases that state it
 * and the one range that cannot mean anything else. Everything else that reads as
 * junior — a graduate programme, an offer of training, mentoring, a `0-2` range —
 * is real evidence but a softer claim, and lands on `LIKELY_ENTRY_LEVEL`.
 *
 * This is what reproduces the seeded fixtures' split between the two junior levels
 * without a tuned threshold. `GRADUATES_WELCOME` is deliberately absent: a posting
 * can welcome graduates and five-year engineers in the same breath.
 */
const DECISIVE_POSITIVE_CODES: ReadonlySet<SignalCode> = new Set([
  'ENTRY_LEVEL_STATED',
  'CAREER_STARTER_WELCOME',
  'NO_EXPERIENCE_REQUIRED',
  'ZERO_TO_ONE_YEARS',
]);

/**
 * One senior responsibility named in the text — leading a team, owning the
 * architecture — is enough to stop a junior figure from reading as `ENTRY_LEVEL`.
 * The number is the weight of the lightest of them, so any single one qualifies.
 */
const SERIOUS_CONCERN_WEIGHT = -25;

/**
 * Two of them, or one plus a supporting concern, and the posting is describing a
 * different job from the one its numbers suggest. On the junior side that is
 * `AMBIGUOUS`; on the experienced side it deepens `EXPERIENCED` to
 * `CLEARLY_EXPERIENCED`.
 */
const DISQUALIFYING_CONCERN_WEIGHT = -50;

/**
 * The phrase-only bands, used when the posting states no usable figure. They are an
 * ordering of evidence strength rather than a calibrated model: `ENTRY_LEVEL` needs
 * a decisive statement *and* corroboration, `LIKELY_ENTRY_LEVEL` needs about one
 * clear positive, and the negative edges mirror the concern thresholds above.
 */
const ENTRY_LEVEL_NET_WEIGHT = 50;
const LIKELY_ENTRY_LEVEL_NET_WEIGHT = 25;
const EXPERIENCED_NET_WEIGHT = -25;
const CLEARLY_EXPERIENCED_NET_WEIGHT = -60;

/**
 * Title words that hint at who a posting is for. They are only ever a tie-break, so
 * the list can stay short: it names the words that are unambiguous in a job title
 * and leaves out everything that needs context.
 *
 * `intern` is bounded on both sides so it cannot match "internal" or
 * "international"; the German entries take a trailing tail so one entry covers
 * `Werkstudent`, `Werkstudentin` and `Berufseinsteiger:innen`.
 */
const JUNIOR_TITLE_PATTERN =
  /\b(junior|jr\.?|graduate|trainee|intern|internship|apprentice|entry[\s-]?level|einsteiger\w*|berufseinsteiger\w*|absolvent\w*|praktikant\w*|praktikum|werkstudent\w*|azubi\w*|auszubildende\w*)\b/i;

/**
 * The other half. `lead` is a whole word only — "lead" in a title is a role, and
 * sentences, where it would more often be a verb, are not read here.
 */
const SENIOR_TITLE_PATTERN =
  /\b(senior|sr\.?|lead|leiter\w*|teamleiter\w*|teamlead\w*|principal|staff|head|chief|manager|architect|expert\w*|director|vp)\b/i;

/** Everything the rules need: the figure, the evidence, and the title. */
export interface LevelInput {
  readonly title?: string | null;
  readonly minYears: number | null;
  readonly maxYears: number | null;
  readonly positiveSignals: readonly Signal[];
  readonly negativeSignals: readonly Signal[];
}

/**
 * The weight of the phrase signals only. The numeric signal is excluded because the
 * figure it quotes has already had its turn: counting it here as well would let a
 * `3+ years` floor push its own posting a second level down for saying one thing.
 */
function phraseWeight(signals: readonly Signal[]): number {
  return signals
    .filter((signal) => !NUMERIC_SIGNAL_CODES.has(signal.code))
    .reduce((total, signal) => total + signal.weight, 0);
}

function hasDecisivePositive(signals: readonly Signal[]): boolean {
  return signals.some((signal) => DECISIVE_POSITIVE_CODES.has(signal.code));
}

/**
 * The posting states a floor of three years or more. Nothing on the positive side is
 * read: see the asymmetry note at the top of the file.
 */
function fromExperiencedFloor(
  input: LevelInput,
  minYears: number,
): JuniorLevel {
  if (minYears >= CLEARLY_EXPERIENCED_FLOOR_YEARS) {
    return 'CLEARLY_EXPERIENCED';
  }

  return phraseWeight(input.negativeSignals) <= DISQUALIFYING_CONCERN_WEIGHT
    ? 'CLEARLY_EXPERIENCED'
    : 'EXPERIENCED';
}

/**
 * The posting states a ceiling of two years or less. The concerns named in its text
 * can demote it, but only within the junior side and only as far as `AMBIGUOUS` — a
 * posting that asks for at most two years is not describing a senior engineer,
 * however its responsibilities read.
 */
function fromJuniorCeiling(input: LevelInput): JuniorLevel {
  const concerns = phraseWeight(input.negativeSignals);

  if (concerns <= DISQUALIFYING_CONCERN_WEIGHT) {
    return 'AMBIGUOUS';
  }
  if (concerns <= SERIOUS_CONCERN_WEIGHT) {
    return 'LIKELY_ENTRY_LEVEL';
  }

  return hasDecisivePositive(input.positiveSignals)
    ? 'ENTRY_LEVEL'
    : 'LIKELY_ENTRY_LEVEL';
}

/**
 * No usable figure: "we do not count years", "1 to 4 years", or no number at all.
 * The phrases carry it, and `ENTRY_LEVEL` still needs one of them to state outright
 * that no experience is needed — weight alone cannot buy the strongest label.
 */
function fromPhrases(input: LevelInput): JuniorLevel {
  const net =
    phraseWeight(input.positiveSignals) + phraseWeight(input.negativeSignals);

  if (
    net >= ENTRY_LEVEL_NET_WEIGHT &&
    hasDecisivePositive(input.positiveSignals)
  ) {
    return 'ENTRY_LEVEL';
  }
  if (net >= LIKELY_ENTRY_LEVEL_NET_WEIGHT) {
    return 'LIKELY_ENTRY_LEVEL';
  }
  if (net <= CLEARLY_EXPERIENCED_NET_WEIGHT) {
    return 'CLEARLY_EXPERIENCED';
  }
  if (net <= EXPERIENCED_NET_WEIGHT) {
    return 'EXPERIENCED';
  }

  return fromTitle(input.title);
}

/**
 * The last word, and the weakest one. It is consulted only where the body reached no
 * verdict at all, moves one step from `AMBIGUOUS`, and can never reach either
 * extreme — a title is a marketing decision, and "Junior" on a posting demanding
 * five years is the case this whole phase is built around.
 */
function fromTitle(title: string | null | undefined): JuniorLevel {
  if (!title) {
    return 'AMBIGUOUS';
  }

  const junior = JUNIOR_TITLE_PATTERN.test(title);
  const senior = SENIOR_TITLE_PATTERN.test(title);

  if (junior === senior) {
    return 'AMBIGUOUS';
  }
  return junior ? 'LIKELY_ENTRY_LEVEL' : 'EXPERIENCED';
}

/** The level this evidence supports, by §6.4's precedence. */
export function decideLevel(input: LevelInput): JuniorLevel {
  const { minYears, maxYears } = input;

  if (minYears !== null && minYears >= EXPERIENCED_FLOOR_YEARS) {
    return fromExperiencedFloor(input, minYears);
  }
  if (maxYears !== null && maxYears <= JUNIOR_CEILING_YEARS) {
    return fromJuniorCeiling(input);
  }

  return fromPhrases(input);
}
