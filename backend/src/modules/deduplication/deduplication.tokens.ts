/**
 * Injection seam for the clock, so `firstSeenAt` / `lastSeenAt` are assertable
 * without waiting for real time to pass. Unprovided in production, where the
 * constructor defaults to `() => new Date()`.
 *
 * Deliberately its own token rather than a reuse of `INGESTION_CLOCK`: importing
 * that symbol would point `deduplication` at `ingestion`, and the dependency arrow
 * in `ARCHITECTURE.md` §4.3 runs the other way.
 */
export const DEDUP_CLOCK = Symbol('DEDUP_CLOCK');
