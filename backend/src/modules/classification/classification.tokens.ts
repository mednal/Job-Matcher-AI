import type { ClassificationResult } from './junior-classifier';

/**
 * Injection seam for the clock, so `Job.classifiedAt` is assertable without waiting
 * for real time to pass. Unprovided in production, where the constructor defaults to
 * `() => new Date()`.
 *
 * Its own token rather than a reuse of `DEDUP_CLOCK` or `INGESTION_CLOCK`: importing
 * either symbol would point `classification` at another pipeline module, and §4.3
 * has the arrows running the other way.
 */
export const CLASSIFICATION_CLOCK = Symbol('CLASSIFICATION_CLOCK');

/**
 * The seam `ScoringService` fills.
 *
 * `JobClassification.score` is NOT NULL, so persistence needs a number, while §6.5
 * puts every rule for producing one in `scoring/`. Rather than duplicate a band
 * table here — the exact way a scorer and its store come to disagree — M8.4 writes
 * whatever this function returns, and M8.5 binds it in `ClassificationModule` to
 * `ScoringService.score` without changing a line of the persistence service.
 *
 * The optional default below survives that binding, because the unit specs in this
 * folder construct `JobClassificationService` by hand and most of them are not about
 * the number. Zero is chosen because it is visibly a placeholder rather than a
 * plausible score: nothing that resolves the token through the module ever sees it.
 */
export const JUNIOR_SCORER = Symbol('JUNIOR_SCORER');

/** Deterministic and pure, per §6.5 — a result in, a 0–100 suitability score out. */
export type JuniorScorer = (result: ClassificationResult) => number;

/** What an unbound {@link JUNIOR_SCORER} writes — never through the module. */
export const UNSCORED = 0;
