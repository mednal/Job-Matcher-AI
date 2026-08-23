import type { JuniorLevel } from '@prisma/client';
import type { Signal } from '../classification/signal';

/**
 * The score itself (M8.5, `ARCHITECTURE.md` §6.5, `DATABASE.md` §4.2).
 *
 * Pure and deterministic — a `ClassificationResult` in, a 0–100 integer out, with no
 * clock, no randomness and no I/O. It lives apart from `ScoringService` for the same
 * reason `level-rules.ts` lives apart from the classifier: the number is the part
 * that will be argued with, and it should be readable without a container.
 *
 * **What the number means.** It is a *junior suitability* score: how well this
 * posting's stated requirements match a candidate with roughly 0–2 years of
 * experience. It is a property of the posting and of nothing else. It is **not** a
 * probability of being hired, interviewed or answered — that constraint comes from
 * `CLAUDE.md` and `PRODUCT.md` §8, is restated in §6.5, and `score-naming.spec.ts`
 * checks the codebase for the vocabulary that would break it.
 *
 * **The shape of the calculation.** §6.5 asks for "a band derived from the
 * `JuniorLevel`, adjusted within that band by signal weights and evidence strength",
 * and that is exactly the two steps below:
 *
 *  1. the level picks a band, and the bands tile 0–100 without overlapping, so a
 *     score can never contradict the band it was derived from;
 *  2. the net signal weight positions the posting inside its own band, saturating at
 *     the edges so no amount of extra evidence can push it into a neighbour.
 *
 * That ordering is the same precedence the classifier applied: the level is the
 * finding, and the weights only rank postings that reached the same finding.
 */

/** A closed integer range, inclusive at both ends. */
export interface ScoreBand {
  readonly min: number;
  readonly max: number;
}

/**
 * The band per level. Contiguous and disjoint, covering 0–100 exactly — checked in
 * `score-bands.spec.ts`, because a gap or an overlap would mean either a score no
 * posting can reach or a score two levels can claim.
 *
 * The edges are where the ten hand-written seed classifications (M2.7) already sit:
 * their `ENTRY_LEVEL` scores are 88–94, `LIKELY_ENTRY_LEVEL` 72–79, `AMBIGUOUS` 48,
 * `EXPERIENCED` 21 and `CLEARLY_EXPERIENCED` 2–6. Those numbers were written by hand
 * long before this file, so agreeing with them is evidence that the bands match the
 * judgement a person makes rather than a scale invented to fit the code — the spec
 * pins that agreement, and a future seed that falls outside its band is a finding.
 */
export const SCORE_BANDS: Readonly<Record<JuniorLevel, ScoreBand>> = {
  ENTRY_LEVEL: { min: 85, max: 100 },
  LIKELY_ENTRY_LEVEL: { min: 65, max: 84 },
  AMBIGUOUS: { min: 40, max: 64 },
  EXPERIENCED: { min: 15, max: 39 },
  CLEARLY_EXPERIENCED: { min: 0, max: 14 },
};

/**
 * The net weight at which a posting sits at the edge of its band.
 *
 * Sixty is roughly two strong statements in one direction — "this is an entry level
 * position" plus "no experience required", or a five-year floor plus a team to
 * manage. Past that the evidence is no longer telling us anything new about *this*
 * band, so the mapping saturates instead of straining towards a neighbour it is not
 * allowed to enter.
 */
export const WEIGHT_SATURATION = 60;

/** What the scorer reads. A structural subset of `ClassificationResult`. */
export interface ScorableClassification {
  readonly level: JuniorLevel;
  readonly positiveSignals: readonly Signal[];
  readonly negativeSignals: readonly Signal[];
}

/**
 * Where in its band this evidence sits, as a fraction from 0 (bottom) to 1 (top).
 *
 * **Every signal counts here, the numeric ones included** — which is the opposite of
 * `phraseWeight` in `level-rules.ts`, and deliberately so. There, excluding the
 * numeric signal stopped a figure from deciding the level twice. Here the level is
 * already decided and nothing can change it, so the figure is simply the strongest
 * thing the posting said about itself: a five-year floor should rank below a
 * three-year one inside `EXPERIENCED`, and it only can if its weight is read.
 *
 * Both directions are read from one sum, so a posting that says both things gets the
 * middle of its band rather than the top — evidence strength, as §6.5 puts it, is
 * the *balance* of the evidence and not the loudest half of it.
 */
function positionInBand(classification: ScorableClassification): number {
  const net = [
    ...classification.positiveSignals,
    ...classification.negativeSignals,
  ].reduce((total, signal) => total + signal.weight, 0);

  const clamped = Math.max(-1, Math.min(1, net / WEIGHT_SATURATION));
  return (clamped + 1) / 2;
}

/**
 * The junior suitability score for a classification: 0–100, integer, deterministic.
 *
 * A classification carrying no signals at all — a posting whose title was the only
 * evidence — lands in the middle of its band, which is the honest answer: the band
 * is what was established, and nothing inside it was.
 */
export function scoreFor(classification: ScorableClassification): number {
  const band = SCORE_BANDS[classification.level];
  return Math.round(
    band.min + positionInBand(classification) * (band.max - band.min),
  );
}
