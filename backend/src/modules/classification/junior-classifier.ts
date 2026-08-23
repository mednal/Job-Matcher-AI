import type { JuniorLevel } from '@prisma/client';
import type { Signal } from './signal';

/**
 * The classifier interface (M8.3, `ARCHITECTURE.md` §6.4).
 *
 * §6.4 puts two classifiers behind one interface so the LLM stage is an
 * enhancement rather than a dependency: `RuleBasedClassifier` always runs, and
 * M8.7's `AiClassifier` — if it ships at all — implements the same contract and is
 * consulted only when the rules return `AMBIGUOUS`. Anything downstream (M8.4's
 * persistence, M8.5's scorer, M5.4's pipeline) therefore depends on this shape and
 * not on which stage produced it.
 *
 * `classify` returns a promise even though the rule-based implementation is
 * synchronous. The AI stage cannot be, and a caller that has to know which kind of
 * classifier it holds is exactly the coupling the interface exists to prevent.
 */
export interface JuniorClassifier {
  /**
   * Stamped onto every result and stored as `JobClassification.classifierVersion`.
   * Because versions are retained, a rule change can be evaluated against past jobs
   * before it is promoted (§6.4).
   */
  readonly version: string;
  classify(input: ClassificationInput): Promise<ClassificationResult>;
}

/**
 * What a classifier is given: the normalized plain-text description (M6.1) and the
 * title, which is one input among many and never decides alone.
 *
 * There is deliberately no `language` field, even though §6.4 says the pattern set
 * is selected by `JobPosting.language`. M8.1 and M8.2 both run their English and
 * German sets unconditionally — the numeric sets are disjoint by unit word, and
 * German postings state English phrases verbatim — so a language here would be a
 * field nothing reads. The same reasoning covers the title vocabulary below.
 */
export interface ClassificationInput {
  readonly title?: string | null;
  readonly description?: string | null;
}

/**
 * The verdict, with the evidence that produced it.
 *
 * There is no `score`: M8.5's `ScoringService` maps this result to the 0–100 junior
 * suitability number, and a classifier that also scored would leave two places that
 * could disagree. `minYears` / `maxYears` are carried through because M8.4
 * denormalizes them onto `Job.requiredMinYears` / `requiredMaxYears`, which back the
 * `maxYearsRequired` search parameter.
 *
 * The two signal lists are the partition on weight sign that `JobClassification`
 * stores (§4.1). Every entry carries a verbatim excerpt, so the level can always be
 * shown alongside the sentences that produced it (`PRODUCT.md` §7).
 */
export interface ClassificationResult {
  readonly classifierVersion: string;
  readonly level: JuniorLevel;
  readonly minYears: number | null;
  readonly maxYears: number | null;
  readonly positiveSignals: readonly Signal[];
  readonly negativeSignals: readonly Signal[];
}
