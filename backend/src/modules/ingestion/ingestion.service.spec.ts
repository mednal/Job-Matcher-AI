import { IngestionTrigger } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SourceRegistryService } from '../sources/source-registry.service';
import { SourceDescriptorError } from '../sources/source-errors';
import type {
  JobSourceAdapter,
  RawJob,
  RawJobFields,
  SourceDescriptor,
  SourceFetchParams,
} from '../sources/source-adapter.types';
import { IngestionService, SINCE_OVERLAP_MS } from './ingestion.service';
import { DEFAULT_SEEDS } from './ingestion-plan';
import {
  RawIngestionService,
  type RawIngestionSummary,
} from './raw-ingestion.service';

/**
 * M5.4's own half of the milestone: the ingestion plan and source isolation. The
 * run engine is faked, because what is under test here is *what it is asked to do*,
 * not what it does — that has its own spec, and the two failing together would tell
 * you nothing about which one broke.
 */

const NOW = new Date('2026-08-23T12:00:00.000Z');

function descriptor(
  overrides: Partial<SourceDescriptor> = {},
): SourceDescriptor {
  return {
    key: 'board-a',
    displayName: 'Board A',
    accessMethod: 'OFFICIAL_FEED',
    termsUrl: 'https://example.com/terms',
    complianceNote: 'Test double.',
    ordering: 'RECENT_FIRST',
    defaults: { rateLimitRps: 5, pageSize: 25, maxPages: 4 },
    ...overrides,
  };
}

function adapter(
  key: string,
  defaults?: SourceDescriptor['defaults'],
): JobSourceAdapter {
  return {
    descriptor: descriptor({ key, ...(defaults ? { defaults } : {}) }),

    async *fetchJobs(): AsyncIterable<RawJob> {
      // never iterated: the run engine is faked
    },
    toRawFields: (): RawJobFields => ({ title: 't', companyName: 'c' }),
  };
}

function summary(sourceKey: string): RawIngestionSummary {
  return {
    sourceKey,
    outcome: 'COMPLETED',
    runId: `run-${sourceKey}`,
    fetched: 1,
    unchanged: 0,
    failed: 0,
    stored: 1,
    created: 1,
    updated: 0,
    duplicates: 0,
  };
}

interface Harness {
  service: IngestionService;
  ingestSource: jest.Mock;
  findFirst: jest.Mock;
}

function harness(adapters: JobSourceAdapter[], lastSuccess?: Date): Harness {
  const byKey = new Map(adapters.map((a) => [a.descriptor.key, a]));

  const findFirst = jest
    .fn()
    .mockResolvedValue(lastSuccess ? { startedAt: lastSuccess } : null);

  const registry = {
    keys: () => [...byKey.keys()],
    require: (key: string) => {
      const found = byKey.get(key);
      if (!found) {
        throw new SourceDescriptorError(
          `No source adapter registered for "${key}"`,
        );
      }
      return found;
    },
  } as unknown as SourceRegistryService;

  const ingestSource = jest
    .fn()
    .mockImplementation((key: string) => Promise.resolve(summary(key)));

  const service = new IngestionService(
    { ingestionRun: { findFirst } } as unknown as PrismaService,
    registry,
    { ingestSource } as unknown as RawIngestionService,
    () => NOW,
  );

  return { service, ingestSource, findFirst };
}

function callArg(mock: jest.Mock, call = 0, arg = 0): unknown {
  return (mock.mock.calls as unknown as unknown[][])[call][arg];
}

/** The seeds one call handed the run engine. */
function seedsPassed(
  ingestSource: jest.Mock,
  call = 0,
): Partial<SourceFetchParams>[] {
  return callArg(ingestSource, call, 1) as Partial<SourceFetchParams>[];
}

describe('IngestionService', () => {
  describe('the ingestion plan (§6, §14.5)', () => {
    it('walks the curated seeds for a source with no override', async () => {
      const { service, ingestSource } = harness([adapter('board-a')]);

      await service.runSource('board-a');

      const seeds = seedsPassed(ingestSource);
      expect(seeds).toHaveLength(DEFAULT_SEEDS.length);
      expect(seeds.map((s) => s.query)).toEqual(
        DEFAULT_SEEDS.map((s) => s.query),
      );
    });

    it('walks a source that takes no query exactly once', async () => {
      // The fixture adapter is §6's "plain recent-postings feed": ten seeds against
      // it would read the same file ten times over.
      const { service, ingestSource } = harness([adapter('fixture-board')]);

      await service.runSource('fixture-board');

      const seeds = seedsPassed(ingestSource);
      expect(seeds).toHaveLength(1);
      expect(seeds[0].query).toBeUndefined();
    });

    it('takes `limit` from the descriptor rather than from the plan', async () => {
      const { service, ingestSource } = harness([
        adapter('board-a', { rateLimitRps: 5, pageSize: 25, maxPages: 4 }),
      ]);

      await service.runSource('board-a');

      // pageSize × maxPages: the request budget of a run is a property of the
      // source being asked, so adding seeds never raises the ceiling on one source.
      for (const seed of seedsPassed(ingestSource)) {
        expect(seed.limit).toBe(100);
      }
    });

    it('replaces the plan when a manual run names a query', async () => {
      const { service, ingestSource } = harness([adapter('board-a')]);

      await service.runSource('board-a', IngestionTrigger.MANUAL, {
        query: 'junior rust developer',
      });

      const seeds = seedsPassed(ingestSource);
      expect(seeds).toEqual([
        expect.objectContaining({ query: 'junior rust developer' }),
      ]);
    });

    it('passes the trigger through unchanged', async () => {
      const { service, ingestSource } = harness([adapter('board-a')]);

      await service.runSource('board-a', IngestionTrigger.MANUAL);

      expect(callArg(ingestSource, 0, 2)).toBe(IngestionTrigger.MANUAL);
    });
  });

  describe('`since` from the last successful run (§6)', () => {
    it('is undefined for a source that has never run successfully', async () => {
      const { service, ingestSource } = harness([adapter('board-a')]);

      await service.runSource('board-a');

      // The first walk is a full one, bounded by the page cap rather than by time.
      for (const seed of seedsPassed(ingestSource)) {
        expect(seed.since).toBeUndefined();
      }
    });

    it('reaches back an overlap window before the last successful start', async () => {
      const lastStart = new Date('2026-08-23T11:00:00.000Z');
      const { service, ingestSource } = harness(
        [adapter('board-a')],
        lastStart,
      );

      await service.runSource('board-a');

      // A posting published while the previous run was in flight would otherwise
      // fall in the gap between "already fetched" and "newer than the run started".
      const expected = new Date(lastStart.getTime() - SINCE_OVERLAP_MS);
      for (const seed of seedsPassed(ingestSource)) {
        expect(seed.since).toEqual(expected);
      }
    });

    it('only considers successful runs', async () => {
      const { service, findFirst } = harness([adapter('board-a')]);

      await service.runSource('board-a');

      // A failed run may have stopped after two pages of ten; treating its start as
      // a watermark would permanently skip everything it never reached.
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'SUCCESS', source: { key: 'board-a' } },
          orderBy: { startedAt: 'desc' },
        }),
      );
    });

    it('never lets a watermark sit in the future', async () => {
      const { service, ingestSource } = harness(
        [adapter('board-a')],
        new Date('2027-01-01T00:00:00.000Z'),
      );

      await service.runSource('board-a');

      // A clock that moved backwards, or a restored database, would otherwise
      // silently fetch nothing at all.
      for (const seed of seedsPassed(ingestSource)) {
        expect(seed.since).toEqual(NOW);
      }
    });

    it('lets an explicit override win', async () => {
      const override = new Date('2026-01-01T00:00:00.000Z');
      const { service, ingestSource } = harness(
        [adapter('board-a')],
        new Date('2026-08-23T11:00:00.000Z'),
      );

      await service.runSource('board-a', IngestionTrigger.MANUAL, {
        since: override,
      });

      expect(seedsPassed(ingestSource)[0].since).toEqual(override);
    });
  });

  describe('source isolation (M5.4 Verify)', () => {
    it('runs every registered source', async () => {
      const { service, ingestSource } = harness([
        adapter('board-a'),
        adapter('board-b'),
      ]);

      const result = await service.runAll();

      expect(ingestSource).toHaveBeenCalledTimes(2);
      expect(result.sources.map((s) => s.sourceKey)).toEqual([
        'board-a',
        'board-b',
      ]);
    });

    it('a failing source never aborts another', async () => {
      const { service, ingestSource } = harness([
        adapter('board-a'),
        adapter('board-b'),
      ]);
      ingestSource.mockImplementation((key: string) =>
        key === 'board-a'
          ? Promise.reject(new Error('adapter exploded'))
          : Promise.resolve(summary(key)),
      );

      const result = await service.runAll();

      expect(result.sources).toHaveLength(2);
      expect(result.sources[0]).toMatchObject({
        sourceKey: 'board-a',
        outcome: 'FAILED',
        errorMessage: 'adapter exploded',
      });
      expect(result.sources[1]).toMatchObject({
        sourceKey: 'board-b',
        outcome: 'COMPLETED',
      });
    });

    it('reports a failure rather than throwing it', async () => {
      const { service, ingestSource } = harness([adapter('board-a')]);
      ingestSource.mockRejectedValue(new Error('database is down'));

      await expect(service.runSource('board-a')).resolves.toMatchObject({
        outcome: 'FAILED',
        fetched: 0,
        stored: 0,
      });
    });

    it('survives a source that cannot even be resolved', async () => {
      const { service } = harness([adapter('board-a')]);

      const result = await service.runSource('board-missing');

      // The registry throws for an unknown key; a scheduled sweep over a stale
      // config must not die on it.
      expect(result.outcome).toBe('FAILED');
      expect(result.errorMessage).toContain('board-missing');
    });

    it('runs sources in sequence, not in parallel', async () => {
      const { service, ingestSource } = harness([
        adapter('board-a'),
        adapter('board-b'),
      ]);
      const order: string[] = [];
      ingestSource.mockImplementation(async (key: string) => {
        order.push(`start:${key}`);
        await Promise.resolve();
        order.push(`end:${key}`);
        return summary(key);
      });

      await service.runAll();

      // Concurrency here would multiply this process's outbound load, and nothing
      // about ingestion is latency-sensitive.
      expect(order).toEqual([
        'start:board-a',
        'end:board-a',
        'start:board-b',
        'end:board-b',
      ]);
    });

    it('reports nothing at all when no source is registered', async () => {
      const { service } = harness([]);

      await expect(service.runAll()).resolves.toEqual({
        trigger: IngestionTrigger.SCHEDULED,
        sources: [],
      });
    });
  });
});
