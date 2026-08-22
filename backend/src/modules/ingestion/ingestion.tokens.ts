/**
 * Injection seam for the clock, so the stale-run threshold and run timestamps are
 * testable without waiting for real time to pass. Unprovided in production, where
 * the constructor defaults to `() => new Date()`.
 */
export const INGESTION_CLOCK = Symbol('INGESTION_CLOCK');
