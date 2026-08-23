import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { IngestionStatus, IngestionTrigger } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  SourceDescriptor,
  SourceFetchParams,
} from '../sources/source-adapter.types';
import { SourceRegistryService } from '../sources/source-registry.service';
import { INGESTION_CLOCK } from './ingestion.tokens';
import { seedsFor, type IngestionSeed } from './ingestion-plan';
import {
  RawIngestionService,
  type RawIngestionSummary,
} from './raw-ingestion.service';

/**
 * M5.4 — the entry point to ingestion (`ARCHITECTURE.md` §6).
 *
 * Three jobs, and deliberately no fourth:
 *
 *  1. **Resolve the plan.** A background crawl has no request to take `query` and
 *     `location` from, so the seeds come from `ingestion-plan.ts`, `since` from the
 *     source's last successful run, and `limit` from the descriptor's own defaults.
 *  2. **Isolate sources.** One source failing must never abort another — the rule
 *     §6 states and the one M5.4's `Verify:` line checks.
 *  3. **Delegate.** Everything about a *run* is `RawIngestionService`'s and
 *     everything about a *posting* is `JobPipelineService`'s. This service persists
 *     nothing itself beyond reading the previous run's timestamp.
 *
 * M5.5's cron and admin trigger call this; it is the seam they need, which is why it
 * exists as its own service rather than as more methods on the run engine.
 */

/** What one call to {@link IngestionService.runAll} did, source by source. */
export interface IngestionRunSummary {
  readonly trigger: IngestionTrigger;
  readonly sources: readonly RawIngestionSummary[];
}

/**
 * How far before the previous run's start `since` reaches back.
 *
 * A posting published *while* the last run was in flight would otherwise fall in the
 * gap between "already fetched" and "newer than the run started". One hour
 * comfortably covers a run bounded by `RUN_BUDGET_MS` (10 minutes) plus clock skew
 * between this process and the source. Overlapping costs almost nothing — the raw
 * stage writes no row for an unchanged payload — while a gap loses postings
 * silently, so the asymmetry is intentional.
 */
export const SINCE_OVERLAP_MS = 60 * 60 * 1000;

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SourceRegistryService,
    private readonly runs: RawIngestionService,
    @Optional()
    @Inject(INGESTION_CLOCK)
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Runs every registered source, in sequence.
   *
   * Sequential rather than concurrent for the same reason the seed walk is: the
   * §7.3.3 rate limiter is per source, so running sources in parallel is fine for
   * *them* but multiplies this process's own outbound load, and nothing about
   * ingestion is latency-sensitive.
   *
   * A source that throws is recorded and the walk continues. That is the whole point
   * of the method: an adapter can fail in ways `RawIngestionService` never sees — a
   * descriptor that cannot be synced, a database hiccup while opening the run — and
   * none of those may cost the other sources their run.
   */
  async runAll(
    trigger: IngestionTrigger = IngestionTrigger.SCHEDULED,
  ): Promise<IngestionRunSummary> {
    const keys = this.registry.keys();
    this.logger.log(
      `Ingestion starting (${trigger}) for ${keys.length} source(s): ${
        keys.join(', ') || 'none'
      }`,
    );

    const sources: RawIngestionSummary[] = [];
    for (const key of keys) {
      sources.push(await this.runSource(key, trigger));
    }

    const failed = sources.filter((s) => s.outcome === 'FAILED').length;
    this.logger.log(
      `Ingestion finished (${trigger}) — ${sources.length - failed}/${
        sources.length
      } source(s) succeeded`,
    );

    return { trigger, sources };
  }

  /**
   * Runs one source under the resolved plan.
   *
   * Never throws: a failure is a `FAILED` summary, because the caller is a loop over
   * every source and the whole contract is that it keeps going. `overrides` lets a
   * manual run narrow the walk — one query, a smaller limit — without touching the
   * plan, which is what makes the M5.5 admin trigger useful for development.
   */
  async runSource(
    sourceKey: string,
    trigger: IngestionTrigger = IngestionTrigger.SCHEDULED,
    overrides: Partial<SourceFetchParams> = {},
  ): Promise<RawIngestionSummary> {
    try {
      const adapter = this.registry.require(sourceKey);
      const params = await this.planFor(adapter.descriptor, overrides);
      return await this.runs.ingestSource(sourceKey, params, trigger);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Source "${sourceKey}" could not be ingested: ${message}`,
      );
      return {
        sourceKey,
        outcome: 'FAILED',
        fetched: 0,
        unchanged: 0,
        failed: 0,
        stored: 0,
        created: 0,
        updated: 0,
        duplicates: 0,
        errorMessage: message,
      };
    }
  }

  /** The seeds of §6, each carrying this run's `since` and the descriptor's limit. */
  private async planFor(
    descriptor: SourceDescriptor,
    overrides: Partial<SourceFetchParams>,
  ): Promise<Partial<SourceFetchParams>[]> {
    const since = overrides.since ?? (await this.sinceFor(descriptor.key));
    const limit = overrides.limit ?? this.limitFor(descriptor);

    // An override naming one query replaces the plan rather than filtering it: a
    // manual run asking for "junior rust developer" means that query, not the ten
    // curated ones with a location bolted on.
    const seeds: readonly IngestionSeed[] =
      overrides.query !== undefined || overrides.location !== undefined
        ? [{ query: overrides.query, location: overrides.location }]
        : seedsFor(descriptor.key);

    return seeds.map((seed) => ({ ...seed, since, limit }));
  }

  /**
   * `since` for the next run: the last **successful** run's `startedAt` minus the
   * overlap window, or undefined when there has never been one.
   *
   * Successful, not merely finished — a failed run may have stopped after two pages
   * of ten, and treating its start as a watermark would permanently skip everything
   * it never reached. A source with no successful run yet gets a full first walk,
   * bounded by the descriptor's page cap rather than by time (§6).
   */
  private async sinceFor(sourceKey: string): Promise<Date | undefined> {
    const last = await this.prisma.ingestionRun.findFirst({
      where: {
        status: IngestionStatus.SUCCESS,
        source: { key: sourceKey },
      },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true },
    });
    if (!last) {
      return undefined;
    }

    const since = new Date(last.startedAt.getTime() - SINCE_OVERLAP_MS);
    // Defensive: a clock that moved backwards, or a restored database, could put
    // the watermark in the future and silently fetch nothing at all.
    const now = this.now();
    return since > now ? now : since;
  }

  /**
   * `limit` per seed: the descriptor's own `pageSize × maxPages`.
   *
   * Taken from the source rather than from the plan on purpose (§6) — it makes the
   * request budget of a run a property of the source being asked, so adding seeds
   * broadens coverage without quietly raising the ceiling on any one source.
   */
  private limitFor(descriptor: SourceDescriptor): number {
    const { pageSize, maxPages } = descriptor.defaults;
    return Math.max(1, pageSize * maxPages);
  }
}
