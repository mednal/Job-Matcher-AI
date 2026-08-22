import type {
  FetchContext,
  JobSourceAdapter,
  RawJob,
  SourceDescriptor,
  SourceFetchParams,
  SourcePage,
  SourcePageRequest,
} from './source-adapter.types';

/**
 * Base for every paginated source (decision A1). Subclasses implement exactly one
 * page; this class drives the loop.
 *
 * That split is the whole point: pagination is where rate-limit and stop-condition
 * mistakes actually happen, and per-source code is the code that gets the least
 * review. The page cap, the cursor-progress check, the `since` early stop, the
 * `limit`, and abort handling all live here, once, for every source.
 */
export abstract class PaginatedSourceAdapter implements JobSourceAdapter {
  abstract readonly descriptor: SourceDescriptor;

  /**
   * Fetch a single page. Implementations must not loop, must not sleep, and must
   * reach the network only through the injected client (§6.1) — every guardrail
   * lives in the client and in this base.
   */
  protected abstract fetchPage(
    request: SourcePageRequest,
    ctx: FetchContext,
  ): Promise<SourcePage>;

  async *fetchJobs(
    params: SourceFetchParams,
    ctx: FetchContext,
  ): AsyncIterable<RawJob> {
    const { pageSize, maxPages } = this.descriptor.defaults;
    const limit = Number.isFinite(params.limit)
      ? Math.max(0, Math.trunc(params.limit))
      : 0;
    if (limit === 0) {
      return;
    }

    const sinceMs = params.since?.getTime();
    const recentFirst = this.descriptor.ordering === 'RECENT_FIRST';

    let yielded = 0;
    let cursor: string | undefined;
    const seenCursors = new Set<string>();

    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
      // Checked before every request, so an exhausted run budget or a shutdown
      // stops us before we make one more call on someone else's API.
      if (ctx.signal.aborted) {
        ctx.logger.warn(
          `Aborted before page ${pageNumber} after ${yielded} item(s)`,
        );
        return;
      }

      const page = await this.fetchPage(
        { params, pageSize, pageNumber, cursor },
        ctx,
      );

      const jobs = page?.jobs ?? [];
      if (jobs.length === 0) {
        return;
      }

      for (const job of jobs) {
        if (ctx.signal.aborted) {
          ctx.logger.warn(`Aborted mid-page after ${yielded} item(s)`);
          return;
        }

        // Defensive only. A null entry would crash the consumer, but this base
        // deliberately does not validate a RawJob's *shape*: item-level failures
        // are counted by the ingestion run, so the check that produces the count
        // belongs next to the counter, not here. `describeAdapterContract` is what
        // holds adapters to the shape.
        if (!job) {
          ctx.logger.warn(
            `Page ${pageNumber} contained an empty entry; skipping`,
          );
          continue;
        }

        if (sinceMs !== undefined && job.postedAt) {
          if (job.postedAt.getTime() < sinceMs) {
            if (recentFirst) {
              // Sound only because the source declared RECENT_FIRST: everything
              // after this point is older still.
              ctx.logger.debug(
                `Reached the \`since\` boundary on page ${pageNumber} after ${yielded} item(s)`,
              );
              return;
            }
            // UNSPECIFIED ordering: a later page may still hold newer postings, so
            // this one is filtered out but the walk continues.
            continue;
          }
        }

        yield job;
        yielded++;
        if (yielded >= limit) {
          return;
        }
      }

      const nextCursor = page.nextCursor;
      if (nextCursor === undefined || nextCursor === null) {
        return;
      }

      // A cursor that repeats means the source (or the adapter) is not advancing.
      // Without this check that is an unbounded request loop against a third party,
      // which is exactly what §7.2 forbids.
      if (nextCursor === cursor || seenCursors.has(nextCursor)) {
        ctx.logger.error(
          `Pagination made no progress at page ${pageNumber} — cursor repeated; ending the run for this source`,
        );
        return;
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }

    ctx.logger.warn(
      `Hit the ${maxPages}-page cap after ${yielded} item(s); stopping`,
    );
  }
}
