import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { IngestionStatus, IngestionTrigger } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RawIngestionService } from '../src/modules/ingestion/raw-ingestion.service';
import { StaleRunReaperService } from '../src/modules/ingestion/stale-run-reaper.service';
import { SourceRegistryService } from '../src/modules/sources/source-registry.service';
import { contentHashOf } from '../src/modules/ingestion/payload-canonicalization';
import { FIXTURE_SOURCE_KEY } from '../src/modules/sources/adapters/fixture/fixture-source.adapter';

/**
 * M5.3's Verify line, against a real database: running the fixture source twice
 * yields one run row per execution and no duplicate raw documents, and a payload
 * differing only in a volatile field writes no row.
 */
describe('Raw ingestion (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ingestion: RawIngestionService;
  let registry: SourceRegistryService;
  let reaper: StaleRunReaperService;
  let sourceId: string;

  /** Everything this suite writes hangs off the fixture source, so cleanup is scoped. */
  async function wipeFixtureData(): Promise<void> {
    const source = await prisma.jobSource.findUnique({
      where: { key: FIXTURE_SOURCE_KEY },
      select: { id: true },
    });
    if (!source) {
      return;
    }
    await prisma.rawJobDocument.deleteMany({ where: { sourceId: source.id } });
    await prisma.ingestionRun.deleteMany({ where: { sourceId: source.id } });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    ingestion = app.get(RawIngestionService);
    registry = app.get(SourceRegistryService);
    reaper = app.get(StaleRunReaperService);

    await wipeFixtureData();
  });

  afterAll(async () => {
    await wipeFixtureData();
    await app.close();
  });

  beforeEach(async () => {
    await wipeFixtureData();
  });

  describe('the adapter is reachable through the registry', () => {
    it('registers the fixture adapter and boots with a valid descriptor', () => {
      expect(registry.has(FIXTURE_SOURCE_KEY)).toBe(true);
      expect(
        registry.descriptor(FIXTURE_SOURCE_KEY).complianceNote,
      ).toBeTruthy();
    });
  });

  describe('first run', () => {
    it('stores one raw document per fixture posting', async () => {
      const summary = await ingestion.ingestSource(FIXTURE_SOURCE_KEY);

      expect(summary.outcome).toBe('COMPLETED');
      expect(summary.fetched).toBe(8);
      expect(summary.stored).toBe(8);
      expect(summary.unchanged).toBe(0);
      expect(summary.failed).toBe(0);

      const source = await prisma.jobSource.findUniqueOrThrow({
        where: { key: FIXTURE_SOURCE_KEY },
        select: { id: true },
      });
      sourceId = source.id;

      const docs = await prisma.rawJobDocument.count({ where: { sourceId } });
      expect(docs).toBe(8);
    });

    it('records the run with the counters this stage owns', async () => {
      await ingestion.ingestSource(
        FIXTURE_SOURCE_KEY,
        {},
        IngestionTrigger.MANUAL,
      );

      const run = await prisma.ingestionRun.findFirstOrThrow({
        orderBy: { startedAt: 'desc' },
        where: { source: { key: FIXTURE_SOURCE_KEY } },
      });

      expect(run.status).toBe(IngestionStatus.SUCCESS);
      expect(run.trigger).toBe(IngestionTrigger.MANUAL);
      expect(run.finishedAt).not.toBeNull();
      expect(run.errorMessage).toBeNull();
      expect(run.fetched).toBe(8);
      expect(run.unchanged).toBe(0);
      expect(run.failed).toBe(0);
      // Owned by stages that do not exist yet — left at zero rather than guessed.
      expect(run.created).toBe(0);
      expect(run.updated).toBe(0);
      expect(run.duplicates).toBe(0);
    });

    it('syncs the descriptor into JobSource (decision A3)', async () => {
      await ingestion.ingestSource(FIXTURE_SOURCE_KEY);

      const source = await prisma.jobSource.findUniqueOrThrow({
        where: { key: FIXTURE_SOURCE_KEY },
      });
      const descriptor = registry.descriptor(FIXTURE_SOURCE_KEY);

      expect(source.displayName).toBe(descriptor.displayName);
      expect(source.accessMethod).toBe(descriptor.accessMethod);
      expect(source.termsUrl).toBe(descriptor.termsUrl);
      expect(source.attributionText).toBe(descriptor.attributionText);
    });

    it('links every raw document to the run that fetched it', async () => {
      const summary = await ingestion.ingestSource(FIXTURE_SOURCE_KEY);

      const orphans = await prisma.rawJobDocument.count({
        where: { source: { key: FIXTURE_SOURCE_KEY }, ingestionRunId: null },
      });
      expect(orphans).toBe(0);

      const linked = await prisma.rawJobDocument.count({
        where: { ingestionRunId: summary.runId },
      });
      expect(linked).toBe(8);
    });
  });

  // The Verify line proper.
  describe('running the fixture source twice', () => {
    it('yields one run row per execution and no duplicate raw documents', async () => {
      const first = await ingestion.ingestSource(FIXTURE_SOURCE_KEY);
      const second = await ingestion.ingestSource(FIXTURE_SOURCE_KEY);

      expect(first.stored).toBe(8);
      // Nothing changed between the runs, so nothing is written the second time.
      expect(second.stored).toBe(0);
      expect(second.unchanged).toBe(8);
      expect(second.fetched).toBe(8);

      const runs = await prisma.ingestionRun.count({
        where: { source: { key: FIXTURE_SOURCE_KEY } },
      });
      expect(runs).toBe(2);

      const docs = await prisma.rawJobDocument.count({
        where: { source: { key: FIXTURE_SOURCE_KEY } },
      });
      expect(docs).toBe(8);
    });

    it('leaves no duplicate (externalId, contentHash) pair', async () => {
      await ingestion.ingestSource(FIXTURE_SOURCE_KEY);
      await ingestion.ingestSource(FIXTURE_SOURCE_KEY);
      await ingestion.ingestSource(FIXTURE_SOURCE_KEY);

      const docs = await prisma.rawJobDocument.findMany({
        where: { source: { key: FIXTURE_SOURCE_KEY } },
        select: { externalId: true, contentHash: true },
      });
      const pairs = docs.map((d) => `${d.externalId}:${d.contentHash}`);

      expect(new Set(pairs).size).toBe(pairs.length);
      expect(docs).toHaveLength(8);
    });

    it('records both runs as successful', async () => {
      await ingestion.ingestSource(FIXTURE_SOURCE_KEY);
      await ingestion.ingestSource(FIXTURE_SOURCE_KEY);

      const runs = await prisma.ingestionRun.findMany({
        where: { source: { key: FIXTURE_SOURCE_KEY } },
        orderBy: { startedAt: 'asc' },
      });

      expect(runs.map((r) => r.status)).toEqual([
        IngestionStatus.SUCCESS,
        IngestionStatus.SUCCESS,
      ]);
      expect(runs[1].unchanged).toBe(8);
    });
  });

  describe('a payload differing only in a volatile field', () => {
    it('writes no new row', async () => {
      await ingestion.ingestSource(FIXTURE_SOURCE_KEY);

      const source = await prisma.jobSource.findUniqueOrThrow({
        where: { key: FIXTURE_SOURCE_KEY },
        select: { id: true },
      });
      const descriptor = registry.descriptor(FIXTURE_SOURCE_KEY);

      const stored = await prisma.rawJobDocument.findFirstOrThrow({
        where: { sourceId: source.id, externalId: 'fx-001' },
      });
      const payload = stored.payload as Record<string, unknown>;

      // Same posting, restamped by the source — exactly what volatilePayloadPaths
      // exists to absorb.
      const restamped = { ...payload, fetchedAt: '2099-01-01T00:00:00.000Z' };

      expect(contentHashOf(restamped, descriptor.volatilePayloadPaths)).toBe(
        stored.contentHash,
      );

      // ...and a real change still produces a different hash.
      const edited = { ...payload, title: 'Something else entirely' };
      expect(contentHashOf(edited, descriptor.volatilePayloadPaths)).not.toBe(
        stored.contentHash,
      );
    });

    it('stores the volatile field rather than stripping it from the payload', async () => {
      await ingestion.ingestSource(FIXTURE_SOURCE_KEY);

      const stored = await prisma.rawJobDocument.findFirstOrThrow({
        where: { source: { key: FIXTURE_SOURCE_KEY }, externalId: 'fx-001' },
      });

      // The hash ignores it; the stored document must not. A recompute migration
      // reads these rows, so anything stripped here would be gone for good.
      expect((stored.payload as Record<string, unknown>).fetchedAt).toBe(
        '2026-08-22T00:00:00.000Z',
      );
    });
  });

  describe('concurrency guard and stale-run reaper', () => {
    it('skips a source that already has a run in flight', async () => {
      const source = await prisma.jobSource.findUniqueOrThrow({
        where: { key: FIXTURE_SOURCE_KEY },
        select: { id: true },
      });
      await prisma.ingestionRun.create({
        data: { sourceId: source.id, status: IngestionStatus.RUNNING },
      });

      const summary = await ingestion.ingestSource(FIXTURE_SOURCE_KEY);

      expect(summary.outcome).toBe('SKIPPED_ALREADY_RUNNING');
      const docs = await prisma.rawJobDocument.count({
        where: { sourceId: source.id },
      });
      expect(docs).toBe(0);
    });

    // Without the reaper the guard above would block the source forever after any
    // process death — the two have to ship together.
    it('reaps an abandoned RUNNING row so the next run can start', async () => {
      const source = await prisma.jobSource.findUniqueOrThrow({
        where: { key: FIXTURE_SOURCE_KEY },
        select: { id: true },
      });
      await prisma.ingestionRun.create({
        data: {
          sourceId: source.id,
          status: IngestionStatus.RUNNING,
          // Two hours ago: past the one-hour stale threshold.
          startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
      });

      const summary = await ingestion.ingestSource(FIXTURE_SOURCE_KEY);

      expect(summary.outcome).toBe('COMPLETED');
      expect(summary.stored).toBe(8);

      const abandoned = await prisma.ingestionRun.findFirstOrThrow({
        where: { sourceId: source.id, status: IngestionStatus.FAILED },
      });
      expect(abandoned.errorMessage).toMatch(/abandoned/i);
      expect(abandoned.finishedAt).not.toBeNull();
    });

    it('leaves a recent RUNNING row alone', async () => {
      const source = await prisma.jobSource.findUniqueOrThrow({
        where: { key: FIXTURE_SOURCE_KEY },
        select: { id: true },
      });
      const fresh = await prisma.ingestionRun.create({
        data: { sourceId: source.id, status: IngestionStatus.RUNNING },
      });

      await reaper.reap(source.id);

      const after = await prisma.ingestionRun.findUniqueOrThrow({
        where: { id: fresh.id },
      });
      expect(after.status).toBe(IngestionStatus.RUNNING);
    });
  });

  describe('disabled sources', () => {
    it('does not run and creates no run row', async () => {
      await prisma.jobSource.update({
        where: { key: FIXTURE_SOURCE_KEY },
        data: { enabled: false },
      });

      try {
        const summary = await ingestion.ingestSource(FIXTURE_SOURCE_KEY);

        expect(summary.outcome).toBe('SKIPPED_DISABLED');
        const runs = await prisma.ingestionRun.count({
          where: { source: { key: FIXTURE_SOURCE_KEY } },
        });
        expect(runs).toBe(0);
      } finally {
        // `enabled` is the one field the database owns; put it back.
        await prisma.jobSource.update({
          where: { key: FIXTURE_SOURCE_KEY },
          data: { enabled: true },
        });
      }
    });
  });

  describe('unknown source', () => {
    it('throws rather than silently doing nothing', async () => {
      await expect(ingestion.ingestSource('no-such-source')).rejects.toThrow(
        /no-such-source/,
      );
    });
  });
});
