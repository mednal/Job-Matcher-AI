import type { Logger } from '@nestjs/common';
import type { AccessMethod } from '@prisma/client';

// The contract every job source implements (docs/ARCHITECTURE.md §6.1). These types
// are the only thing the rest of the application may know about a source: nothing
// outside this directory imports a concrete adapter or names a source-specific
// field.

/**
 * A single posting exactly as the source returned it.
 *
 * `payload` is deliberately `unknown`. It is stored verbatim in `RawJobDocument`
 * and interpreted only by the normalization stage (M6), so giving it a shape here
 * would leak one source's response format into the shared contract.
 */
export interface RawJob {
  /** Stable within this source, permanently. Half of the tier-1 dedup key. */
  externalId: string;
  /** Absolute https URL of the original posting — what the UI links out to (§7.4). */
  url: string;
  /** Stored verbatim in RawJobDocument. */
  payload: unknown;
  /** Only when the source states it. Enables the `since` early-stop below. */
  postedAt?: Date;
}

export interface SourceFetchParams {
  query?: string;
  location?: string;
  /**
   * Only postings at or after this instant are wanted. Honoured as an early stop
   * for `RECENT_FIRST` sources and as a filter for `UNSPECIFIED` ones — see
   * PaginatedSourceAdapter.
   */
  since?: Date;
  /** Hard cap on items yielded for this call, across all pages. */
  limit: number;
}

export interface FetchContext {
  readonly runId: string;
  /** Aborted when the run budget is exhausted or the process is shutting down. */
  readonly signal: AbortSignal;
  /** Pre-tagged with sourceKey + runId. */
  readonly logger: Logger;
}

/**
 * How a source orders its results. This is a factual claim about the source, not a
 * preference: the `since` early-stop is only sound when it is `RECENT_FIRST`, so
 * declaring it wrongly silently truncates a run.
 */
export type SourceOrdering = 'RECENT_FIRST' | 'UNSPECIFIED';

/**
 * The machine-readable twin of the header comment §7.3 requires — compliance
 * metadata as data rather than prose, so the application can enforce it.
 *
 * Per decision A3 these fields are authoritative **in code** and synced
 * one-directionally into `JobSource`. The database owns only `JobSource.enabled`,
 * so a misbehaving source can be stopped without a deploy.
 */
export interface SourceDescriptor {
  /** Matches `JobSource.key`. */
  readonly key: string;
  readonly displayName: string;
  /** §7.1. There is deliberately no enum value for scraping, and none may be added. */
  readonly accessMethod: AccessMethod;
  /** The terms, licence or agreement permitting this access method. */
  readonly termsUrl: string;
  /** Rendered by the UI wherever the source's postings appear, when required (§7.4). */
  readonly attributionText?: string;
  /** Why this access method is permitted for this source, in one sentence. */
  readonly complianceNote: string;
  readonly ordering: SourceOrdering;
  /**
   * Dot-separated paths excluded from `RawJobDocument.contentHash` — fields the
   * source rewrites on every response (timestamps, request ids, signed URLs)
   * which would otherwise make an unchanged posting look changed on every run.
   * The payload is still stored verbatim; only the hash ignores these.
   */
  readonly volatilePayloadPaths?: string[];
  readonly defaults: {
    /** Our own client-side ceiling, independent of what the source enforces (§7.3.3). */
    readonly rateLimitRps: number;
    readonly pageSize: number;
    /** Page cap — the backstop against a paginating source that never ends. */
    readonly maxPages: number;
  };
}

export interface JobSourceAdapter {
  readonly descriptor: SourceDescriptor;
  /**
   * Streams postings. An `AsyncIterable`, not a `Promise<RawJob[]>` (decision A1):
   * the orchestrator owns pagination, backpressure and early termination, so the
   * loop where rate-limit and stop-condition mistakes actually happen lives in
   * shared reviewed code rather than in per-source code.
   */
  fetchJobs(
    params: SourceFetchParams,
    ctx: FetchContext,
  ): AsyncIterable<RawJob>;
}

/** One page request, handed to `PaginatedSourceAdapter.fetchPage`. */
export interface SourcePageRequest {
  readonly params: SourceFetchParams;
  readonly pageSize: number;
  /** 1-based. */
  readonly pageNumber: number;
  /** Opaque cursor returned by the previous page, if the source is cursor-based. */
  readonly cursor?: string;
}

export interface SourcePage {
  readonly jobs: readonly RawJob[];
  /**
   * Omit (or return undefined) when there are no further pages. Returning the same
   * cursor twice is treated as "no progress" and ends the run — see
   * PaginatedSourceAdapter.
   */
  readonly nextCursor?: string;
}
