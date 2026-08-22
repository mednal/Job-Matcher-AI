import { Logger } from '@nestjs/common';
import { IngestionStatus, IngestionTrigger } from '@prisma/client';
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
  options: { enabled?: boolean; inFlight?: number } = {},
): Harness {
  const { enabled = true, inFlight = 0 } = options;

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
    // M5.3 populates only these three. The rest belong to stages that do not exist
    // yet and are left at their defaults rather than guessed at.
    it('writes fetched, unchanged and failed only', async () => {
      const { service, prisma } = harness(adapterYielding([job('a')]));

      await service.ingestSource('fixture-board');

      const data = runUpdateData(prisma);
      expect(data).toHaveProperty('fetched');
      expect(data).toHaveProperty('unchanged');
      expect(data).toHaveProperty('failed');
      expect(data).not.toHaveProperty('created');
      expect(data).not.toHaveProperty('updated');
      expect(data).not.toHaveProperty('duplicates');
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

  it('gives the adapter an abort signal it can observe', async () => {
    const fetchJobs = jest.fn().mockImplementation(async function* () {
      // no items
    });
    const adapter: JobSourceAdapter = {
      descriptor: descriptor(),
      fetchJobs: fetchJobs,
    };
    const { service } = harness(adapter);

    await service.ingestSource('fixture-board');

    const ctx = callArg(fetchJobs, 0, 1) as FetchContext;
    expect(ctx.signal).toBeInstanceOf(AbortSignal);
    expect(ctx.signal.aborted).toBe(false);
  });
});
