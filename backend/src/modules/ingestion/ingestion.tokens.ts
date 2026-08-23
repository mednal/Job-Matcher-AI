/**
 * Injection seam for the clock, so the stale-run threshold and run timestamps are
 * testable without waiting for real time to pass. Unprovided in production, where
 * the constructor defaults to `() => new Date()`.
 */
export const INGESTION_CLOCK = Symbol('INGESTION_CLOCK');

/**
 * The seam `JobPipelineService` fills (M5.4).
 *
 * `RawIngestionService` owns the run — fetching, the `IngestionRun` row, the budget
 * and failure isolation — and knows nothing about what a posting becomes. Injecting
 * the downstream stages as a token rather than as the concrete service is what keeps
 * the run engine testable with no stages at all, and keeps M5.3's raw-only behaviour
 * reachable: unprovided, the run still fetches and stores, and the stage counters
 * stay zero.
 */
export const JOB_PIPELINE = Symbol('JOB_PIPELINE');
