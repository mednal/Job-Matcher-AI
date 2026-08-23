/**
 * The `Signal` shape and its weight table (M8.2, `ARCHITECTURE.md` §5.3,
 * `DATABASE.md` §4.1).
 *
 * A signal is one piece of evidence found in a posting: a code naming what was
 * found, a weight that is its contribution to the score, and the **verbatim**
 * excerpt that produced it. The excerpt is the part that is not negotiable — it is
 * what makes the explanation in `PRODUCT.md` §7 possible and what lets a bad
 * classification be argued with after the fact.
 *
 * The weights live here, in one table keyed by code, rather than beside the phrases
 * that emit them. Two readers need them: the extractor, which stamps them onto every
 * match, and M8.5's scorer, which adjusts within a band by signal weight. A second
 * copy would be a silent way for the two to disagree about what a signal is worth.
 *
 * **Polarity is the sign of the weight.** There is no separate field: a positive
 * weight is a positive signal and a negative weight a negative one, so the two
 * arrays `JobClassification` stores can be produced by partitioning on the sign and
 * cannot drift out of step with it.
 *
 * The codes and most of the numbers are the vocabulary `prisma/seed-data.ts` already
 * uses, so the hand-written fixture classifications and the extractor speak the same
 * language. Where they differ it is deliberate and stated below.
 */

/** One piece of evidence. The stored shape of `DATABASE.md` §4.1, exactly. */
export interface Signal {
  readonly code: SignalCode;
  /** Contribution to the score. Positive favours a junior, negative excludes one. */
  readonly weight: number;
  /** Verbatim excerpt from the description. Never rewritten, never summarized. */
  readonly evidence: string;
}

/**
 * Every signal this stage can emit, with what it is worth.
 *
 * The scale is loose on purpose: it is an ordering of evidence strength, not a
 * calibrated model. What matters is the ranking — an explicit "entry level" outweighs
 * an offer of training, and a five-year floor outweighs any of the positives put
 * together, which is what makes the adversarial "Junior title, 5+ years in the body"
 * posting come out `EXPERIENCED` at M8.3.
 *
 * Two divergences from the seeded fixtures, both towards internal consistency:
 * `ZERO_TO_ONE_YEARS` and `ZERO_TO_TWO_YEARS` are worth the same (the seeds score the
 * wider range higher, which cannot be right), and `TRAINING_PROVIDED` is one number
 * rather than the seeds' 15 and 10.
 */
export const SIGNAL_WEIGHTS = {
  // --- Positive: the posting says it is open to someone starting out ------------
  /** "This is an entry level position", "Einstiegsposition". */
  ENTRY_LEVEL_STATED: 30,
  /** "Berufseinsteiger sind willkommen", "career starters welcome". */
  CAREER_STARTER_WELCOME: 30,
  /** "No professional experience is required", "keine Berufserfahrung nötig". */
  NO_EXPERIENCE_REQUIRED: 25,
  /** Numeric: a stated range ending at or below two years. */
  ZERO_TO_ONE_YEARS: 25,
  ZERO_TO_TWO_YEARS: 25,
  ONE_TO_TWO_YEARS: 20,
  /** Numeric: any other range whose ceiling is two years or less. */
  UP_TO_TWO_YEARS: 15,
  /** "recent graduates are welcome to apply", "Hochschulabsolventinnen". */
  GRADUATES_WELCOME: 20,
  /** A named programme for people entering the profession. */
  GRADUATE_PROGRAMME: 20,
  /** "training provided", "strukturierte Einarbeitung". */
  TRAINING_PROVIDED: 15,
  /** The candidate is the one being mentored — not the one doing the mentoring. */
  MENTORING_OFFERED: 15,
  /** Internships and working-student roles count towards the requirement. */
  INTERNSHIP_COUNTS: 15,
  /** The posting says outright that it does not count years. */
  YEARS_NOT_REQUIRED: 15,

  // --- Negative: the posting is describing someone further along ----------------
  /** Numeric: a floor of five years or more. */
  REQUIRES_5_PLUS_YEARS: -40,
  /** Numeric: a floor of three or four years. */
  REQUIRES_3_PLUS_YEARS: -35,
  /** Managing people, not just leading work. */
  TEAM_MANAGEMENT: -30,
  /** Leading a team as part of the role. */
  TEAM_LEAD: -25,
  /** Setting technical direction, mentoring juniors, owning the architecture. */
  LEAD_RESPONSIBILITIES: -25,
  /** The posting states it is a senior role, whatever the title says. */
  SENIOR_RESPONSIBILITIES: -25,
  /** "extensive production experience", "mehrjährige Berufserfahrung". */
  EXTENSIVE_PROFESSIONAL_EXPERIENCE: -20,
  /** Candidates without commercial experience are explicitly ruled out. */
  NO_EXPERIENCE_EXCLUDED: -20,
  /** Owning features from design through to production. */
  END_TO_END_OWNERSHIP: -15,
  /** Taking over systems somebody else built. */
  OWNERSHIP_OF_EXISTING_SERVICES: -15,
  /** On-call duty, Rufbereitschaft. */
  ON_CALL_EXPECTED: -10,
  /** Production exposure asked for but not required — a hint, not a barrier. */
  PRODUCTION_EXPOSURE_PREFERRED: -5,
} as const;

export type SignalCode = keyof typeof SIGNAL_WEIGHTS;

/** Builds a signal, taking the weight from the one table that owns it. */
export function createSignal(code: SignalCode, evidence: string): Signal {
  return { code, weight: SIGNAL_WEIGHTS[code], evidence };
}

/** True when the code counts in the candidate's favour. */
export function isPositive(code: SignalCode): boolean {
  return SIGNAL_WEIGHTS[code] > 0;
}
