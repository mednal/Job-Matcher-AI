import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  IngestionStatus,
  IngestionTrigger,
  Prisma,
  type JobSource,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SourceRegistryService } from '../sources/source-registry.service';
import type {
  FetchContext,
  JobSourceAdapter,
  RawJob,
  SourceDescriptor,
  SourceFetchParams,
} from '../sources/source-adapter.types';
import { SourceError } from '../sources/source-errors';
import type {
  JobPipelineService,
  PipelineResult,
} from './job-pipeline.service';
import { contentHashOf } from './payload-canonicalization';
import { StaleRunReaperService } from './stale-run-reaper.service';
import { INGESTION_CLOCK, JOB_PIPELINE } from './ingestion.tokens';

/**
 * M5.3/M5.4 — the run engine: fetch a source, persist what came back verbatim, and
 * hand each posting to the downstream stages.
 *
 * It owns everything that is true of a *run* rather than of a posting: the
 * `IngestionRun` row, the concurrency guard, the time budget, the seed walk, and the
 * rule that one bad item never discards the ones already stored. What a posting
 * becomes is `JobPipelineService`'s, reached through the {@link JOB_PIPELINE} seam —
 * so this file has no idea that normalization, deduplication or classification
 * exist, and M5.3's raw-only behaviour is still exactly what happens when the seam
 * is unfilled.
 *
 * The seed walk (M5.4, `ARCHITECTURE.md` §6) is here rather than above this service
 * because all of a source's seeds belong to **one** run: they overlap heavily by
 * design, and a run row per seed would report the same posting as new ten times.
 * Seeds are walked in sequence, never in parallel — concurrency here would multiply
 * the request rate the §7.3.3 limiter exists to hold down.
 */

export type RawIngestionOutcome =
  'COMPLETED' | 'FAILED' | 'SKIPPED_DISABLED' | 'SKIPPED_ALREADY_RUNNING';

export interface RawIngestionSummary {
  readonly sourceKey: string;
  readonly outcome: RawIngestionOutcome;
  /** Absent when the run was skipped — no row is created for a skip. */
  readonly runId?: string;
  /** Items the adapter yielded. */
  readonly fetched: number;
  /** Of those, ones whose canonical payload already had a row: nothing written. */
  readonly unchanged: number;
  /** Items that could not be processed. Each is skipped; the run continues. */
  readonly failed: number;
  /** New `RawJobDocument` rows: `fetched - unchanged - failed`. */
  readonly stored: number;
  /** Postings tier 1 inserted. Zero without a pipeline. */
  readonly created: number;
  /** Postings tier 1 rewrote — a content change or a reactivation. */
  readonly updated: number;
  /**
   * Postings that joined an existing `Job` on this run (tiers 2 and 3).
   *
   * Not the same as "seen before": a posting that was already clustered keeps its
   * cluster without any matching happening, and counting that would make the number
   * grow on every run until it just restated `fetched`. This counts discoveries.
   */
  readonly duplicates: number;
  readonly errorMessage?: string;
}

/** The mutable half of the run counters the stages contribute to. */
interface StageCounters {
  created: number;
  updated: number;
  duplicates: number;
}

/** How long a single source's run may take before its budget aborts it. */
export const RUN_BUDGET_MS = 10 * 60 * 1000; // 10 minutes

/** Default ceiling on items per run when the caller does not specify one. */
export const DEFAULT_ITEM_LIMIT = 500;

@Injectable()
export class RawIngestionService {
  private readonly logger = new Logger(RawIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SourceRegistryService,
    private readonly reaper: StaleRunReaperService,
    @Optional()
    @Inject(INGESTION_CLOCK)
    private readonly now: () => Date = () => new Date(),
    @Optional()
    @Inject(JOB_PIPELINE)
    private readonly pipeline: JobPipelineService | null = null,
  ) {}

  /**
   * Runs one source end to end.
   *
   * `params` accepts a single set or a list of them — the list is the seed walk of
   * §6, and one run covers all of them. A caller that passes neither gets one
   * unfiltered walk, which is what the M5.3 specs and a smoke test want.
   */
  async ingestSource(
    sourceKey: string,
    params:
      Partial<SourceFetchParams> | readonly Partial<SourceFetchParams>[] = {},
    trigger: IngestionTrigger = IngestionTrigger.SCHEDULED,
  ): Promise<RawIngestionSummary> {
    const adapter = this.registry.require(sourceKey);
    const source = await this.syncSource(adapter.descriptor);

    // The database owns `enabled` and nothing else (A3), so a misbehaving source is
    // stopped with an UPDATE rather than a deploy. No run row is created: a run that
    // never happened is not a failure to investigate.
    if (!source.enabled) {
      this.logger.log(`Source "${sourceKey}" is disabled; skipping`);
      return this.skipped(sourceKey, 'SKIPPED_DISABLED');
    }

    await this.reaper.reap(source.id);

    const run = await this.startRun(source.id, trigger);
    if (!run) {
      this.logger.warn(
        `Source "${sourceKey}" already has a run in progress; skipping`,
      );
      return this.skipped(sourceKey, 'SKIPPED_ALREADY_RUNNING');
    }

    const seeds = Array.isArray(params) ? params : [params];
    // An empty list would produce a successful run that fetched nothing — the
    // hardest kind of misconfiguration to notice in a log.
    return this.executeRun(
      adapter,
      source,
      run.id,
      seeds.length > 0 ? seeds : [{}],
    );
  }

  /**
   * Descriptor → `JobSource`, one-directionally (A3). Compliance fields are
   * authoritative in code, so they are overwritten on every run; `enabled` is
   * written only on create, because the database owns it.
   */
  private async syncSource(descriptor: SourceDescriptor): Promise<JobSource> {
    const compliance = {
      displayName: descriptor.displayName,
      accessMethod: descriptor.accessMethod,
      termsUrl: descriptor.termsUrl,
      attributionText: descriptor.attributionText ?? null,
    };

    return this.prisma.jobSource.upsert({
      where: { key: descriptor.key },
      create: { key: descriptor.key, ...compliance },
      update: compliance,
    });
  }

  /**
   * Creates the `RUNNING` row, or returns null when one already exists.
   *
   * Check and insert share a transaction so two runs started in the same process
   * cannot both pass. **This narrows the race, it does not close it**: two separate
   * processes can still interleave between the count and the insert under
   * PostgreSQL's default READ COMMITTED. Closing it properly needs a partial unique
   * index — `CREATE UNIQUE INDEX ... ON "IngestionRun"("sourceId") WHERE status =
   * 'RUNNING'` — which is a migration, and M2 is closed. Until ingestion is
   * scheduled across more than one process (M5.5) the transaction is sufficient,
   * and the reaper bounds the damage either way.
   */
  private async startRun(
    sourceId: string,
    trigger: IngestionTrigger,
  ): Promise<{ id: string } | null> {
    return this.prisma.$transaction(async (tx) => {
      const inFlight = await tx.ingestionRun.count({
        where: { sourceId, status: IngestionStatus.RUNNING },
      });
      if (inFlight > 0) {
        return null;
      }
      return tx.ingestionRun.create({
        data: { sourceId, trigger, status: IngestionStatus.RUNNING },
        select: { id: true },
      });
    });
  }

  private async executeRun(
    adapter: JobSourceAdapter,
    source: JobSource,
    runId: string,
    seeds: readonly Partial<SourceFetchParams>[],
  ): Promise<RawIngestionSummary> {
    const sourceKey = adapter.descriptor.key;
    const controller = new AbortController();
    // Bounds the run so a source that streams forever cannot hold the RUNNING row
    // open until the reaper notices an hour later.
    const budget = setTimeout(() => controller.abort(), RUN_BUDGET_MS);

    const ctx: FetchContext = {
      runId,
      signal: controller.signal,
      logger: new Logger(`ingestion:${sourceKey}:${runId.slice(0, 8)}`),
    };

    const counts = {
      fetched: 0,
      unchanged: 0,
      failed: 0,
      created: 0,
      updated: 0,
      duplicates: 0,
    };
    let runError: string | undefined;

    try {
      for (const seed of seeds) {
        if (ctx.signal.aborted) {
          ctx.logger.warn('Run budget exhausted; remaining seeds skipped');
          break;
        }

        const stream = adapter.fetchJobs(
          {
            query: seed.query,
            location: seed.location,
            since: seed.since,
            limit: seed.limit ?? DEFAULT_ITEM_LIMIT,
          },
          ctx,
        );

        for await (const job of stream) {
          counts.fetched++;
          try {
            await this.processItem(adapter, source, runId, job, counts);
          } catch (error) {
            // Item-level: one unusable posting must not discard the ones already
            // stored, so it is counted and the walk continues.
            counts.failed++;
            ctx.logger.warn(
              `Item ${job?.externalId ?? '<no id>'} failed: ${this.messageOf(error)}`,
            );
          }
        }
      }
    } catch (error) {
      // Run-level. Everything persisted so far stays persisted — the counts below
      // describe what actually happened, not what was attempted. The remaining
      // seeds are abandoned on purpose: a stop condition such as a 429 means stop
      // asking this source, and asking it nine more times would be the retry storm
      // §7.2 forbids.
      runError = this.messageOf(error);
      if (error instanceof SourceError && error.terminatesRun) {
        ctx.logger.error(`Run ended by a stop condition: ${runError}`);
      } else {
        ctx.logger.error(`Run failed: ${runError}`);
      }
    } finally {
      clearTimeout(budget);
    }

    const { fetched, unchanged, failed, created, updated, duplicates } = counts;
    const stored = fetched - unchanged - failed;
    await this.prisma.ingestionRun.update({
      where: { id: runId },
      data: {
        status: runError ? IngestionStatus.FAILED : IngestionStatus.SUCCESS,
        finishedAt: this.now(),
        // Only these three are populated at this stage. `created`, `updated` and
        // `duplicates` belong to the normalization and deduplication stages, which
        // do not exist yet, and stay 0 rather than being guessed at here.
        fetched,
        unchanged,
        failed,
        // Zero without a pipeline, which is M5.3's raw-only shape rather than a
        // guess: no stage ran, so nothing was created, updated or matched.
        created,
        updated,
        duplicates,
        errorMessage: runError ? runError.slice(0, 1000) : null,
      },
    });

    this.logger.log(
      `[${sourceKey}] run ${runId.slice(0, 8)} ${runError ? 'FAILED' : 'SUCCESS'} — ` +
        `fetched=${fetched} stored=${stored} unchanged=${unchanged} failed=${failed} ` +
        `created=${created} updated=${updated} duplicates=${duplicates}`,
    );

    return {
      sourceKey,
      outcome: runError ? 'FAILED' : 'COMPLETED',
      runId,
      fetched,
      unchanged,
      failed,
      stored,
      created,
      updated,
      duplicates,
      errorMessage: runError,
    };
  }

  /**
   * One fetched posting: the raw write, then the stages.
   *
   * The stages run for **every** item, including one whose payload was
   * byte-identical to the stored copy. `JobPosting` and `Job` are retired by
   * `lastSeenAt` (M5.6, `DATABASE.md` §8), and a posting the source is still
   * listing has been seen whether or not its text moved — skipping the unchanged
   * case would retire everything nobody edits. The stages recognize that case
   * themselves, and it costs a timestamp and a cached lookup.
   *
   * Throws for the caller's item-level handler. Both halves are deliberately inside
   * that one boundary: a posting whose raw document stored but whose normalization
   * threw is one failed item, not a half-successful one.
   */
  private async processItem(
    adapter: JobSourceAdapter,
    source: JobSource,
    runId: string,
    job: RawJob,
    counts: StageCounters & { unchanged: number },
  ): Promise<void> {
    const wrote = await this.persist(source, adapter.descriptor, runId, job);
    if (!wrote) {
      counts.unchanged++;
    }

    if (!this.pipeline) {
      return;
    }

    const result = await this.pipeline.process({
      sourceId: source.id,
      externalId: job.externalId,
      url: job.url,
      // The one call that reads a source-specific field, and it happens inside the
      // adapter (§4.2). A payload this adapter cannot map throws, and the item is
      // counted as failed like any other.
      fields: adapter.toRawFields(job.payload),
      postedAt: job.postedAt ?? null,
    });

    this.tally(result, counts);
  }

  /** Pipeline outcomes to the run's stage counters. */
  private tally(result: PipelineResult, counts: StageCounters): void {
    if (result.postingOutcome === 'CREATED') {
      counts.created++;
    } else if (result.postingOutcome === 'UPDATED') {
      counts.updated++;
    }
    if (
      result.clusterOutcome === 'MATCHED' ||
      result.clusterOutcome === 'FUZZY_MATCHED'
    ) {
      counts.duplicates++;
    }
  }

  /**
   * Writes one `RawJobDocument`. Returns false when the payload is unchanged and
   * nothing was written.
   */
  private async persist(
    source: JobSource,
    descriptor: SourceDescriptor,
    runId: string,
    job: RawJob,
  ): Promise<boolean> {
    // The shape check the paginated base deliberately leaves alone: it lives here,
    // next to the `failed` counter it feeds.
    if (typeof job?.externalId !== 'string' || job.externalId.length === 0) {
      throw new Error('RawJob has no externalId');
    }
    if (typeof job.url !== 'string' || !job.url.startsWith('https://')) {
      throw new Error(`RawJob ${job.externalId} has no absolute https url`);
    }
    if (job.payload === undefined || job.payload === null) {
      throw new Error(`RawJob ${job.externalId} has no payload`);
    }

    const contentHash = contentHashOf(
      job.payload,
      descriptor.volatilePayloadPaths,
    );

    const existing = await this.prisma.rawJobDocument.findUnique({
      where: {
        sourceId_externalId_contentHash: {
          sourceId: source.id,
          externalId: job.externalId,
          contentHash,
        },
      },
      select: { id: true },
    });
    if (existing) {
      return false;
    }

    try {
      await this.prisma.rawJobDocument.create({
        data: {
          sourceId: source.id,
          ingestionRunId: runId,
          externalId: job.externalId,
          contentHash,
          // Verbatim, per §6.1 — the hash ignores volatile fields, the stored
          // document does not. A recompute migration (DATABASE.md §6) reads these,
          // so anything stripped here would be gone for good.
          payload: job.payload,
        },
      });
      return true;
    } catch (error) {
      // Another run inserted the same (source, externalId, hash) between the read
      // and the write. That is the unchanged case, reached by a different route.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }

  private skipped(
    sourceKey: string,
    outcome: RawIngestionOutcome,
  ): RawIngestionSummary {
    return {
      sourceKey,
      outcome,
      fetched: 0,
      unchanged: 0,
      failed: 0,
      stored: 0,
      created: 0,
      updated: 0,
      duplicates: 0,
    };
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
