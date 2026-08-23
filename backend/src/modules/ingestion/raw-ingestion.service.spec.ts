import { Logger } from '@nestjs/common';
import { IngestionStatus, IngestionTrigger } from '@prisma/client';
import type { JobPipelineService } from './job-pipeline.service';
import { RawIngestionService } from './raw-ingestion.service';
import { StaleRunReaperService } from './stale-run-reaper.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SourceRegistryService } from '../sources/source-registry.service';
import {
  SourceRateLimitError,
  SourceItemError,
} from '../sources/source-errors';
import type {
  FetchContext,
  JobSourceAdapter,
  RawJob,
  RawJobFields,
  SourceDescriptor,
} from '../sources/source-adapter.types';

const SOURCE_ID = 'source-1';
const NOW = new Date('2026-08-22T12:00:00.000Z');

function descriptor(
  overrides: Partial<SourceDescriptor> = {},
): SourceDescriptor {
  return {
    key: 'fixture-board',
    displayName: 'Fixture Job Board (development only)',
    accessMethod: 'OFFICIAL_FEED',
    termsUrl: 'https://example.com/terms',
    complianceNote: 'Local fixtures.',
    ordering: 'RECENT_FIRST',
    volatilePayloadPaths: ['fetchedAt'],
    defaults: { rateLimitRps: 5, pageSize: 3, maxPages: 5 },
    ...overrides,
  };
}

function job(id: string, payload: unknown = { id }): RawJob {
  return { externalId: id, url: `https://example.com/jobs/${id}`, payload };
}

/** Adapter that replays a scripted stream, optionally throwing partway through. */
function adapterYielding(
  items: RawJob[],
  throwAfter?: { index: number; error: unknown },
): JobSourceAdapter {
  return {
    descriptor: descriptor(),
    toRawFields: (payload: unknown): RawJobFields => ({
      title: `Title ${String((payload as { id?: string })?.id ?? '')}`,
      companyName: 'Scripted Co',
    }),
    // eslint-disable-next-line @typescript-eslint/require-await
    async *fetchJobs(): AsyncIterable<RawJob> {
      for (let i = 0; i < items.length; i++) {
        if (throwAfter && i === throwAfter.index) {
          throw throwAfter.error;
        }
        yield items[i];
      }
      if (throwAfter && throwAfter.index >= items.length) {
        throw throwAfter.error;
      }
    },
  };
}

interface Harness {
  service: RawIngestionService;
  prisma: {
    jobSource: { upsert: jest.Mock };
    ingestionRun: { create: jest.Mock; update: jest.Mock; count: jest.Mock };
    rawJobDocument: { findUnique: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };
  reaper: { reap: jest.Mock };
}

function harness(
  adapter: JobSourceAdapter,
  options: {
    enabled?: boolean;
    inFlight?: number;
    /** Unset leaves the JOB_PIPELINE seam empty — M5.3's raw-only shape. */
    pipeline?: { process: jest.Mock };
  } = {},
): Harness {
  const { enabled = true, inFlight = 0, pipeline = null } = options;

  const prisma = {
    jobSource: {
      upsert: jest.fn().mockResolvedValue({
        id: SOURCE_ID,
        key: adapter.descriptor.key,
        enabled,
      }),
    },
    ingestionRun: {
      create: jest.fn().mockResolvedValue({ id: 'run-1' }),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(inFlight),
    },
    rawJobDocument: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'raw-1' }),
    },
    $transaction: jest.fn(),
  };
  // Run the transaction callback against the same mocks the assertions inspect.
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    Promise.resolve(fn(prisma)),
  );

  const registry = {
    require: jest.fn().mockReturnValue(adapter),
  } as unknown as SourceRegistryService;
  const reaper = { reap: jest.fn().mockResolvedValue(0) };

  const service = new RawIngestionService(
    prisma as unknown as PrismaService,
    registry,
    reaper as unknown as StaleRunReaperService,
    () => NOW,
    pipeline as unknown as JobPipelineService | null,
  );

  return { service, prisma, reaper };
}

/**
 * jest types `mock.calls` as `any[][]`, so reading an argument off it defeats
 * type-checking in exactly the assertions that most need it. Narrow once, here.
 */
function callArg(mock: jest.Mock, call = 0, arg = 0): unknown {
  return (mock.mock.calls as unknown as unknown[][])[call][arg];
}

function runUpdateData(prisma: Harness['prisma']): Record<string, unknown> {
  const call = callArg(prisma.ingestionRun.update) as {
    data: Record<string, unknown>;
  };
  return call.data;
}

describe('RawIngestionService', () => {
  let errorLog: jest.SpyInstance;
  let warnLog: jest.SpyInstance;

  beforeEach(() => {
    errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    warnLog = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorLog.mockRestore();
    warnLog.mockRestore();
  });

  describe('descriptor sync (decision A3)', () => {
    it('writes the compliance fields from code on every run', async () => {
      const { service, prisma } = harness(adapterYielding([]));

      await service.ingestSource('fixture-board');

      const call = callArg(prisma.jobSource.upsert) as {
        update: Record<string, unknown>;
      };
      expect(call.update).toMatchObject({
        displayName: 'Fixture Job Board (development only)',
        accessMethod: 'OFFICIAL_FEED',
        termsUrl: 'https://example.com/terms',
      });
    });

    // The database owns `enabled` and nothing else, so a source can be stopped
    // without a deploy.
    it('never writes `enabled` on update', async () => {
      const { service, prisma } = harness(adapterYielding([]));

      await service.ingestSource('fixture-board');

      const call = callArg(prisma.jobSource.upsert) as {
        update: Record<string, unknown>;
        create: Record<string, unknown>;
      };
      expect(call.update).not.toHaveProperty('enabled');
      expect(call.create).not.toHaveProperty('enabled');
    });
  });

  describe('disabled sources', () => {
    it('skips without creating a run row', async () => {
      const { service, prisma } = harness(adapterYielding([job('a')]), {
        enabled: false,
      });

      const summary = await service.ingestSource('fixture-board');

      expect(summary.outcome).toBe('SKIPPED_DISABLED');
      expect(summary.runId).toBeUndefined();
      // A run that never happened is not a failure to investigate.
      expect(prisma.ingestionRun.create).not.toHaveBeenCalled();
    });
  });

  describe('concurrency guard', () => {
    it('reaps stale runs before checking for one in flight', async () => {
      const { service, reaper } = harness(adapterYielding([]));

      await service.ingestSource('fixture-board');

      // Without this order a run killed mid-flight blocks the source forever.
      expect(reaper.reap).toHaveBeenCalledWith(SOURCE_ID);
    });

    it('skips when a run is already in progress', async () => {
      const { service, prisma } = harness(adapterYielding([job('a')]), {
        inFlight: 1,
      });

      const summary = await service.ingestSource('fixture-board');

      expect(summary.outcome).toBe('SKIPPED_ALREADY_RUNNING');
      expect(prisma.ingestionRun.create).not.toHaveBeenCalled();
    });

    it('checks and creates inside one transaction', async () => {
      const { service, prisma } = harness(adapterYielding([]));

      await service.ingestSource('fixture-board');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.ingestionRun.count).toHaveBeenCalledWith({
        where: { sourceId: SOURCE_ID, status: IngestionStatus.RUNNING },
      });
    });

    it('opens the run as RUNNING with the requested trigger', async () => {
      const { service, prisma } = harness(adapterYielding([]));

      await service.ingestSource('fixture-board', {}, IngestionTrigger.MANUAL);

      expect(prisma.ingestionRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            sourceId: SOURCE_ID,
            trigger: IngestionTrigger.MANUAL,
            status: IngestionStatus.RUNNING,
          },
        }),
      );
    });
  });

  describe('raw persistence', () => {
    it('stores a new payload verbatim with its content hash', async () => {
      const payload = { id: 'a', title: 'Junior Dev', fetchedAt: 'now' };
      const { service, prisma } = harness(adapterYielding([job('a', payload)]));

      const summary = await service.ingestSource('fixture-board');

      const created = (
        callArg(prisma.rawJobDocument.create) as {
          data: {
            payload: unknown;
            contentHash: string;
            externalId: string;
            ingestionRunId: string;
          };
        }
      ).data;
      // Verbatim: the volatile field is excluded from the hash, not from storage.
      expect(created.payload).toEqual(payload);
      expect(created.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(created.externalId).toBe('a');
      expect(created.ingestionRunId).toBe('run-1');
      expect(summary.stored).toBe(1);
    });

    it('writes no row when the payload is unchanged', async () => {
      const { service, prisma } = harness(adapterYielding([job('a')]));
      prisma.rawJobDocument.findUnique.mockResolvedValue({ id: 'existing' });

      const summary = await service.ingestSource('fixture-board');

      expect(prisma.rawJobDocument.create).not.toHaveBeenCalled();
      expect(summary.unchanged).toBe(1);
      expect(summary.stored).toBe(0);
    });

    // The hash ignores declared volatile paths, which is what makes the unchanged
    // case reachable at all for a source that stamps every response.
    it('treats a payload differing only in a volatile field as unchanged', async () => {
      const first = harness(
        adapterYielding([job('a', { id: 'a', fetchedAt: 'monday' })]),
      );
      await first.service.ingestSource('fixture-board');
      const hashA = (
        callArg(first.prisma.rawJobDocument.create) as {
          data: { contentHash: string };
        }
      ).data.contentHash;

      const second = harness(
        adapterYielding([job('a', { id: 'a', fetchedAt: 'tuesday' })]),
      );
      await second.service.ingestSource('fixture-board');
      const hashB = (
        callArg(second.prisma.rawJobDocument.create) as {
          data: { contentHash: string };
        }
      ).data.contentHash;

      expect(hashB).toBe(hashA);
    });

    it('treats a concurrent insert of the same hash as unchanged', async () => {
      const { service, prisma } = harness(adapterYielding([job('a')]));
      prisma.rawJobDocument.create.mockRejectedValue(
        Object.assign(new Error('unique'), {
          code: 'P2002',
          constructor: { name: 'PrismaClientKnownRequestError' },
        }),
      );

      const summary = await service.ingestSource('fixture-board');

      // Not a P2002 instance in this unit context, so it lands as an item failure
      // rather than silently succeeding — the e2e proves the real P2002 path.
      expect(summary.fetched).toBe(1);
      expect(summary.stored + summary.unchanged + summary.failed).toBe(1);
    });
  });

  describe('item-level failures degrade', () => {
    it.each([
      [
        'no externalId',
        { externalId: '', url: 'https://e.com/a', payload: {} },
      ],
      [
        'a non-https url',
        { externalId: 'a', url: 'http://e.com/a', payload: {} },
      ],
      [
        'no payload',
        { externalId: 'a', url: 'https://e.com/a', payload: null },
      ],
    ])(
      'counts an item with %s as failed and continues',
      async (_label, bad) => {
        const { service } = harness(adapterYielding([bad, job('good')]));

        const summary = await service.ingestSource('fixture-board');

        expect(summary.fetched).toBe(2);
        expect(summary.failed).toBe(1);
        expect(summary.stored).toBe(1);
        expect(summary.outcome).toBe('COMPLETED');
      },
    );

    it('keeps the run successful when only items failed', async () => {
      const { service, prisma } = harness(
        adapterYielding([{ externalId: '', url: '', payload: {} }]),
      );

      const summary = await service.ingestSource('fixture-board');

      expect(summary.outcome).toBe('COMPLETED');
      expect(runUpdateData(prisma).status).toBe(IngestionStatus.SUCCESS);
    });
  });

  describe('run-level failures stop', () => {
    // A 429 must end the run, and everything already stored stays stored.
    it('marks the run FAILED and keeps the counts up to the failure', async () => {
      const { service, prisma } = harness(
        adapterYielding([job('a'), job('b')], {
          index: 2,
          error: new SourceRateLimitError('fixture-board'),
        }),
      );

      const summary = await service.ingestSource('fixture-board');

      expect(summary.outcome).toBe('FAILED');
      expect(summary.fetched).toBe(2);
      expect(summary.stored).toBe(2);
      const data = runUpdateData(prisma);
      expect(data.status).toBe(IngestionStatus.FAILED);
      expect(data.fetched).toBe(2);
      expect(String(data.errorMessage)).toMatch(/429/);
    });

    it('records an error message for a non-source failure too', async () => {
      const { service, prisma } = harness(
        adapterYielding([], { index: 0, error: new Error('adapter exploded') }),
      );

      const summary = await service.ingestSource('fixture-board');

      expect(summary.outcome).toBe('FAILED');
      expect(runUpdateData(prisma).errorMessage).toMatch(/adapter exploded/);
    });

    it('truncates a very long error message rather than failing the update', async () => {
      const { service, prisma } = harness(
        adapterYielding([], { index: 0, error: new Error('x'.repeat(5000)) }),
      );

      await service.ingestSource('fixture-board');

      expect(String(runUpdateData(prisma).errorMessage)).toHaveLength(1000);
    });

    it('distinguishes a run-terminating error from an item error', () => {
      expect(new SourceRateLimitError('k').terminatesRun).toBe(true);
      expect(new SourceItemError('k', 'bad item').terminatesRun).toBe(false);
    });
  });

  describe('run counters', () => {
    // M5.3 wrote only fetch-side counters, because the stages producing the rest did
    // not exist. M5.4 supplies them through the JOB_PIPELINE seam — and with the seam
    // unfilled they are zero because nothing ran, which is a fact rather than the
    // guess the old default was.
    it('writes every counter, with the stage counters zero and no pipeline', async () => {
      const { service, prisma } = harness(adapterYielding([job('a')]));

      await service.ingestSource('fixture-board');

      expect(runUpdateData(prisma)).toEqual(
        expect.objectContaining({
          fetched: 1,
          unchanged: 0,
          failed: 0,
          created: 0,
          updated: 0,
          duplicates: 0,
        }),
      );
    });

    it('counts what the pipeline reported', async () => {
      const process = jest.fn().mockResolvedValue({
        postingId: 'p-1',
        postingOutcome: 'CREATED',
        jobId: 'j-1',
        clusterOutcome: 'MATCHED',
        classificationOutcome: 'CLASSIFIED',
      });
      const { service, prisma } = harness(adapterYielding([job('a')]), {
        pipeline: { process },
      });

      await service.ingestSource('fixture-board');

      expect(runUpdateData(prisma)).toEqual(
        expect.objectContaining({ created: 1, updated: 0, duplicates: 1 }),
      );
    });

    it('does not count an already-clustered posting as a duplicate', async () => {
      // Otherwise the number would grow on every run until it just restated
      // `fetched`. It counts discoveries, not postings that were seen before.
      const process = jest.fn().mockResolvedValue({
        postingId: 'p-1',
        postingOutcome: 'UNCHANGED',
        jobId: 'j-1',
        clusterOutcome: 'ALREADY_CLUSTERED',
        classificationOutcome: 'CACHED',
      });
      const { service, prisma } = harness(adapterYielding([job('a')]), {
        pipeline: { process },
      });

      await service.ingestSource('fixture-board');

      expect(runUpdateData(prisma)).toEqual(
        expect.objectContaining({ created: 0, updated: 0, duplicates: 0 }),
      );
    });

    it('closes the run with the injected clock', async () => {
      const { service, prisma } = harness(adapterYielding([]));

      await service.ingestSource('fixture-board');

      expect(runUpdateData(prisma).finishedAt).toEqual(NOW);
    });

    it('clears errorMessage on a successful run', async () => {
      const { service, prisma } = harness(adapterYielding([job('a')]));

      await service.ingestSource('fixture-board');

      expect(runUpdateData(prisma).errorMessage).toBeNull();
    });
  });

  it('passes the caller fetch params through to the adapter', async () => {
    const since = new Date('2026-08-01T00:00:00.000Z');
    const fetchJobs = jest.fn().mockImplementation(async function* () {
      // no items
    });
    const adapter: JobSourceAdapter = {
      descriptor: descriptor(),
      fetchJobs: fetchJobs,
      toRawFields: () => ({ title: 'unused', companyName: 'unused' }),
    };
    const { service } = harness(adapter);

    await service.ingestSource('fixture-board', {
      query: 'junior',
      location: 'Berlin',
      since,
      limit: 25,
    });

    expect(fetchJobs).toHaveBeenCalledWith(
      { query: 'junior', location: 'Berlin', since, limit: 25 },
      expect.objectContaining({ runId: 'run-1' }),
    );
  });

  describe('the seed walk (M5.4)', () => {
    it('walks every seed inside one run', async () => {
      const fetchJobs = jest.fn().mockImplementation(async function* () {
        // no items
      });
      const adapter: JobSourceAdapter = {
        descriptor: descriptor(),
        fetchJobs: fetchJobs,
        toRawFields: () => ({ title: 'unused', companyName: 'unused' }),
      };
      const { service, prisma } = harness(adapter);

      await service.ingestSource('fixture-board', [
        { query: 'junior developer', limit: 50 },
        { query: 'graduate engineer', limit: 50 },
      ]);

      // One IngestionRun, three fetches. A run row per seed would report the same
      // posting as new once per seed, since seeds overlap by design.
      expect(fetchJobs).toHaveBeenCalledTimes(2);
      expect(prisma.ingestionRun.create).toHaveBeenCalledTimes(1);
      expect(prisma.ingestionRun.update).toHaveBeenCalledTimes(1);
    });

    it('walks seeds in sequence, never in parallel', async () => {
      const order: string[] = [];
      const fetchJobs = jest
        .fn()
        .mockImplementation((params: { query?: string }) => {
          order.push(`start:${params.query}`);
          // eslint-disable-next-line require-yield
          return (async function* (): AsyncIterable<RawJob> {
            await Promise.resolve();
            order.push(`end:${params.query}`);
          })();
        });
      const adapter: JobSourceAdapter = {
        descriptor: descriptor(),
        fetchJobs: fetchJobs,
        toRawFields: () => ({ title: 'unused', companyName: 'unused' }),
      };
      const { service } = harness(adapter);

      await service.ingestSource('fixture-board', [
        { query: 'a' },
        { query: 'b' },
      ]);

      // Concurrency here would multiply the request rate the §7.3.3 limiter exists
      // to hold down.
      expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b']);
    });

    it('accumulates counters across seeds', async () => {
      const { service, prisma } = harness(
        adapterYielding([job('a'), job('b')]),
      );

      await service.ingestSource('fixture-board', [
        { query: 'a' },
        { query: 'b' },
      ]);

      // The same two postings, fetched by both seeds. The second pass recognizes
      // the stored payload by content hash and writes nothing.
      const data = runUpdateData(prisma);
      expect(data.fetched).toBe(4);
      expect(data.failed).toBe(0);
    });

    it('abandons the remaining seeds on a stop condition', async () => {
      const fetchJobs = jest.fn().mockImplementation(() =>
        // eslint-disable-next-line require-yield
        (async function* (): AsyncIterable<RawJob> {
          await Promise.resolve();
          throw new SourceRateLimitError('fixture-board');
        })(),
      );
      const adapter: JobSourceAdapter = {
        descriptor: descriptor(),
        fetchJobs: fetchJobs,
        toRawFields: () => ({ title: 'unused', companyName: 'unused' }),
      };
      const { service, prisma } = harness(adapter);

      await service.ingestSource('fixture-board', [
        { query: 'a' },
        { query: 'b' },
        { query: 'c' },
      ]);

      // Asking nine more times after a 429 is the retry storm §7.2 forbids.
      expect(fetchJobs).toHaveBeenCalledTimes(1);
      expect(runUpdateData(prisma).status).toBe(IngestionStatus.FAILED);
    });

    it('treats an empty seed list as one unfiltered walk', async () => {
      const fetchJobs = jest.fn().mockImplementation(async function* () {
        // no items
      });
      const adapter: JobSourceAdapter = {
        descriptor: descriptor(),
        fetchJobs: fetchJobs,
        toRawFields: () => ({ title: 'unused', companyName: 'unused' }),
      };
      const { service } = harness(adapter);

      await service.ingestSource('fixture-board', []);

      // A successful run that fetched nothing is the hardest misconfiguration to
      // notice in a log.
      expect(fetchJobs).toHaveBeenCalledTimes(1);
    });
  });

  describe('the pipeline seam (M5.4)', () => {
    it('hands each stored posting to the pipeline, mapped by the adapter', async () => {
      const process = jest.fn().mockResolvedValue({
        postingId: 'p-1',
        postingOutcome: 'CREATED',
        jobId: 'j-1',
        clusterOutcome: 'CREATED',
        classificationOutcome: 'CLASSIFIED',
      });
      const { service } = harness(adapterYielding([job('a')]), {
        pipeline: { process },
      });

      await service.ingestSource('fixture-board');

      expect(process).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: SOURCE_ID,
          externalId: 'a',
          url: 'https://example.com/jobs/a',
          // The one place a source-specific field is read, and it happened inside
          // the adapter.
          fields: { title: 'Title a', companyName: 'Scripted Co' },
        }),
      );
    });

    it('runs the pipeline for an unchanged payload too', async () => {
      const process = jest.fn().mockResolvedValue({
        postingId: 'p-1',
        postingOutcome: 'UNCHANGED',
        jobId: 'j-1',
        clusterOutcome: 'ALREADY_CLUSTERED',
        classificationOutcome: 'CACHED',
      });
      const { service, prisma } = harness(adapterYielding([job('a')]), {
        pipeline: { process },
      });
      // Already stored: the raw stage writes no row for this one.
      prisma.rawJobDocument.findUnique.mockResolvedValue({ id: 'raw-1' });

      await service.ingestSource('fixture-board');

      // M5.6 retires a posting by `lastSeenAt`, and only the stages stamp it.
      expect(prisma.rawJobDocument.create).not.toHaveBeenCalled();
      expect(process).toHaveBeenCalledTimes(1);
    });

    it('counts a pipeline failure as one failed item and carries on', async () => {
      const process = jest
        .fn()
        .mockRejectedValueOnce(new Error('normalization exploded'))
        .mockResolvedValue({
          postingId: 'p-2',
          postingOutcome: 'CREATED',
          jobId: 'j-2',
          clusterOutcome: 'CREATED',
          classificationOutcome: 'CLASSIFIED',
        });
      const { service, prisma } = harness(
        adapterYielding([job('a'), job('b')]),
        { pipeline: { process } },
      );

      const summary = await service.ingestSource('fixture-board');

      expect(summary.outcome).toBe('COMPLETED');
      expect(summary.failed).toBe(1);
      expect(summary.created).toBe(1);
      expect(runUpdateData(prisma).status).toBe(IngestionStatus.SUCCESS);
    });

    it('counts an unmappable payload as one failed item', async () => {
      const process = jest.fn().mockResolvedValue({
        postingId: 'p-2',
        postingOutcome: 'CREATED',
        jobId: 'j-2',
        clusterOutcome: 'CREATED',
        classificationOutcome: 'CLASSIFIED',
      });
      const adapter: JobSourceAdapter = {
        ...adapterYielding([job('a'), job('b')]),
        toRawFields: (payload: unknown) => {
          if ((payload as { id?: string })?.id === 'a') {
            throw new Error('payload has no title');
          }
          return { title: 'Title b', companyName: 'Scripted Co' };
        },
      };
      const { service } = harness(adapter, { pipeline: { process } });

      const summary = await service.ingestSource('fixture-board');

      expect(summary.failed).toBe(1);
      expect(process).toHaveBeenCalledTimes(1);
    });
  });

  it('gives the adapter an abort signal it can observe', async () => {
    const fetchJobs = jest.fn().mockImplementation(async function* () {
      // no items
    });
    const adapter: JobSourceAdapter = {
      descriptor: descriptor(),
      fetchJobs: fetchJobs,
      toRawFields: () => ({ title: 'unused', companyName: 'unused' }),
    };
    const { service } = harness(adapter);

    await service.ingestSource('fixture-board');

    const ctx = callArg(fetchJobs, 0, 1) as FetchContext;
    expect(ctx.signal).toBeInstanceOf(AbortSignal);
    expect(ctx.signal.aborted).toBe(false);
  });
});
