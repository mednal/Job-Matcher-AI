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
import { contentHashOf } from './payload-canonicalization';
import { StaleRunReaperService } from './stale-run-reaper.service';
import { INGESTION_CLOCK } from './ingestion.tokens';

/**
 * M5.3 — fetch a source and persist what came back, verbatim.
 *
 * This is deliberately **only** the raw stage: fetch → `RawJobDocument` → close out
 * the `IngestionRun`. Normalization, deduplication, classification and scoring are
 * M5.4's orchestration, which is blocked on the ingestion-plan question
 * (`ARCHITECTURE.md` §14.5) and is not pre-empted here. Splitting it this way means
 * the raw stage is provable now: the payloads land, the hashes dedupe, and the run
 * bookkeeping is correct, before any of the stages that consume them exist.
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
  readonly errorMessage?: string;
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
  ) {}

  async ingestSource(
    sourceKey: string,
    params: Partial<SourceFetchParams> = {},
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

    return this.executeRun(adapter, source, run.id, params);
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
    params: Partial<SourceFetchParams>,
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

    let fetched = 0;
    let unchanged = 0;
    let failed = 0;
    let runError: string | undefined;

    try {
      const stream = adapter.fetchJobs(
        {
          query: params.query,
          location: params.location,
          since: params.since,
          limit: params.limit ?? DEFAULT_ITEM_LIMIT,
        },
        ctx,
      );

      for await (const job of stream) {
        fetched++;
        try {
          const wrote = await this.persist(
            source,
            adapter.descriptor,
            runId,
            job,
          );
          if (!wrote) {
            unchanged++;
          }
        } catch (error) {
          // Item-level: one unusable posting must not discard the ones already
          // stored, so it is counted and the walk continues.
          failed++;
          ctx.logger.warn(
            `Item ${job?.externalId ?? '<no id>'} failed: ${this.messageOf(error)}`,
          );
        }
      }
    } catch (error) {
      // Run-level. Everything persisted so far stays persisted — the counts below
      // describe what actually happened, not what was attempted.
      runError = this.messageOf(error);
      if (error instanceof SourceError && error.terminatesRun) {
        ctx.logger.error(`Run ended by a stop condition: ${runError}`);
      } else {
        ctx.logger.error(`Run failed: ${runError}`);
      }
    } finally {
      clearTimeout(budget);
    }

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
        errorMessage: runError ? runError.slice(0, 1000) : null,
      },
    });

    this.logger.log(
      `[${sourceKey}] run ${runId.slice(0, 8)} ${runError ? 'FAILED' : 'SUCCESS'} — ` +
        `fetched=${fetched} stored=${stored} unchanged=${unchanged} failed=${failed}`,
    );

    return {
      sourceKey,
      outcome: runError ? 'FAILED' : 'COMPLETED',
      runId,
      fetched,
      unchanged,
      failed,
      stored,
      errorMessage: runError,
    };
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
    };
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
