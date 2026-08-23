import { Injectable, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { IngestionStatus, IngestionTrigger } from '@prisma/client';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { IngestionService } from '../src/modules/ingestion/ingestion.service';
import { SOURCE_ADAPTERS } from '../src/modules/sources/source-adapters.token';
import { PaginatedSourceAdapter } from '../src/modules/sources/paginated-source.adapter';
import { SourceProtocolError } from '../src/modules/sources/source-errors';
import type {
  RawJobFields,
  SourceDescriptor,
  SourcePage,
} from '../src/modules/sources/source-adapter.types';
import { FixtureSourceAdapter } from '../src/modules/sources/adapters/fixture/fixture-source.adapter';

/**
 * M5.4's `Verify:` line, against a real database: a deliberately failing adapter
 * leaves the other source's run successful — plus the pipeline it orchestrates,
 * proven by the rows it produced rather than by the counters it reported.
 *
 * The failing adapter is declared here rather than shipped in `sources/`: it exists
 * to break, and an adapter that always throws has no business being registrable in
 * production. It is injected by replacing the `SOURCE_ADAPTERS` array, which is the
 * same seam §6.1 uses to add a real source.
 */

const BROKEN_KEY = 'broken-board';
const FIXTURE_KEY = 'fixture-board';

/** Fails on its first page, for the isolation case. */
@Injectable()
class BrokenSourceAdapter extends PaginatedSourceAdapter {
  readonly descriptor: SourceDescriptor = {
    key: BROKEN_KEY,
    displayName: 'Deliberately Broken Board (test only)',
    accessMethod: 'OFFICIAL_FEED',
    termsUrl: 'https://example.com/terms',
    complianceNote:
      'Test-only adapter that always fails. Contacts nothing and reads nothing.',
    ordering: 'UNSPECIFIED',
    defaults: { rateLimitRps: 1, pageSize: 5, maxPages: 2 },
  };

  protected fetchPage(): Promise<SourcePage> {
    return Promise.reject(
      new SourceProtocolError(BROKEN_KEY, 'This source is deliberately broken'),
    );
  }

  toRawFields(): RawJobFields {
    throw new SourceProtocolError(BROKEN_KEY, 'never reached');
  }
}

describe('Ingestion pipeline (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ingestion: IngestionService;

  /** Everything this suite writes hangs off its two sources, so cleanup is scoped. */
  async function wipe(): Promise<void> {
    const sources = await prisma.jobSource.findMany({
      where: { key: { in: [FIXTURE_KEY, BROKEN_KEY] } },
      select: { id: true },
    });
    const sourceIds = sources.map((s) => s.id);
    if (sourceIds.length === 0) {
      return;
    }

    // The jobs this suite creates are reachable only through its own postings, so
    // they are collected before the postings go.
    const jobIds = (
      await prisma.jobPosting.findMany({
        where: { sourceId: { in: sourceIds }, jobId: { not: null } },
        select: { jobId: true },
      })
    )
      .map((p) => p.jobId)
      .filter((id): id is string => id !== null);

    await prisma.rawJobDocument.deleteMany({
      where: { sourceId: { in: sourceIds } },
    });
    await prisma.jobPosting.deleteMany({
      where: { sourceId: { in: sourceIds } },
    });
    await prisma.ingestionRun.deleteMany({
      where: { sourceId: { in: sourceIds } },
    });
    if (jobIds.length > 0) {
      await prisma.jobClassification.deleteMany({
        where: { jobId: { in: jobIds } },
      });
      await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    }
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // The registered array plus the broken adapter — the fixture source has to
      // stay, because the point of the case is that it survives the other's failure.
      .overrideProvider(SOURCE_ADAPTERS)
      .useFactory({
        inject: [FixtureSourceAdapter],
        factory: (fixture: FixtureSourceAdapter) => [
          new BrokenSourceAdapter(),
          fixture,
        ],
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    ingestion = app.get(IngestionService);

    await wipe();
  });

  afterAll(async () => {
    await wipe();
    await app.close();
  });

  describe('one failing source never aborts another (M5.4 Verify)', () => {
    let sources: Awaited<ReturnType<IngestionService['runAll']>>['sources'];

    beforeAll(async () => {
      await wipe();
      ({ sources } = await ingestion.runAll(IngestionTrigger.MANUAL));
    });

    it('runs both sources', () => {
      expect(sources.map((s) => s.sourceKey).sort()).toEqual([
        BROKEN_KEY,
        FIXTURE_KEY,
      ]);
    });

    it('records the broken source as failed', async () => {
      const broken = sources.find((s) => s.sourceKey === BROKEN_KEY);
      expect(broken?.outcome).toBe('FAILED');
      expect(broken?.stored).toBe(0);

      const run = await prisma.ingestionRun.findFirstOrThrow({
        where: { source: { key: BROKEN_KEY } },
        orderBy: { startedAt: 'desc' },
      });
      expect(run.status).toBe(IngestionStatus.FAILED);
      expect(run.errorMessage).toContain('deliberately broken');
    });

    it('leaves the other source’s run successful', async () => {
      const fixture = sources.find((s) => s.sourceKey === FIXTURE_KEY);
      expect(fixture?.outcome).toBe('COMPLETED');
      expect(fixture?.stored).toBeGreaterThan(0);

      const run = await prisma.ingestionRun.findFirstOrThrow({
        where: { source: { key: FIXTURE_KEY } },
        orderBy: { startedAt: 'desc' },
      });
      expect(run.status).toBe(IngestionStatus.SUCCESS);
      expect(run.errorMessage).toBeNull();
      expect(run.created).toBeGreaterThan(0);
    });

    it('produced no rows for the failing source', async () => {
      const postings = await prisma.jobPosting.count({
        where: { source: { key: BROKEN_KEY } },
      });
      expect(postings).toBe(0);
    });
  });

  describe('fetch → raw → normalize → dedupe → classify → score', () => {
    beforeAll(async () => {
      await wipe();
      await ingestion.runSource(FIXTURE_KEY, IngestionTrigger.MANUAL);
    });

    it('turns every fetched posting into a JobPosting', async () => {
      const raw = await prisma.rawJobDocument.count({
        where: { source: { key: FIXTURE_KEY } },
      });
      const postings = await prisma.jobPosting.count({
        where: { source: { key: FIXTURE_KEY } },
      });

      expect(raw).toBeGreaterThan(0);
      expect(postings).toBe(raw);
    });

    it('normalizes each posting into the shared vocabulary', async () => {
      const posting = await prisma.jobPosting.findFirstOrThrow({
        where: { source: { key: FIXTURE_KEY }, externalId: 'fx-001' },
      });

      expect(posting.title).toBe('Junior Backend Developer (m/f/d)');
      expect(posting.companySlug).toBe('nordwind-software');
      expect(posting.countryCode).toBe('DE');
      expect(posting.language).toBe('en');
      expect(posting.technologies).toEqual(
        expect.arrayContaining(['java', 'spring', 'postgresql']),
      );
      expect(posting.description).not.toContain('<');
    });

    it('clusters each posting into a canonical Job', async () => {
      const unclustered = await prisma.jobPosting.count({
        where: { source: { key: FIXTURE_KEY }, jobId: null },
      });
      expect(unclustered).toBe(0);
    });

    it('classifies and scores every job it created', async () => {
      const jobs = await prisma.job.findMany({
        where: { postings: { some: { source: { key: FIXTURE_KEY } } } },
        select: {
          normalizedTitle: true,
          juniorLevel: true,
          juniorScore: true,
          classifiedAt: true,
        },
      });

      expect(jobs.length).toBeGreaterThan(0);
      for (const job of jobs) {
        expect(job.juniorLevel).not.toBeNull();
        expect(job.juniorScore).not.toBeNull();
        expect(job.classifiedAt).not.toBeNull();
        expect(job.juniorScore!).toBeGreaterThanOrEqual(0);
        expect(job.juniorScore!).toBeLessThanOrEqual(100);
      }
    });

    it('stores the evidence behind each verdict', async () => {
      const classification = await prisma.jobClassification.findFirstOrThrow({
        where: {
          isCurrent: true,
          job: { postings: { some: { source: { key: FIXTURE_KEY } } } },
        },
      });

      expect(classification.classifierVersion).toBe('rules-1.0');
      // PRODUCT.md §7: the level is always showable alongside the sentences that
      // produced it, so at least one side of the partition has to be populated.
      const positive = classification.positiveSignals as unknown[];
      const negative = classification.negativeSignals as unknown[];
      expect(positive.length + negative.length).toBeGreaterThan(0);
    });

    it('reads the adversarial posting on its body, not its title', async () => {
      // fx-003 is titled "Junior Java Developer" and demands 5+ years plus team
      // leadership. Getting this one wrong is the product problem stated in
      // CLAUDE.md, so it is asserted end to end rather than only in M8.6's corpus.
      const posting = await prisma.jobPosting.findFirstOrThrow({
        where: { source: { key: FIXTURE_KEY }, externalId: 'fx-003' },
        select: { job: { select: { juniorLevel: true, juniorScore: true } } },
      });

      expect(posting.job?.juniorLevel).toBe('CLEARLY_EXPERIENCED');
      expect(posting.job!.juniorScore!).toBeLessThan(15);
    });
  });

  describe('re-ingestion', () => {
    beforeAll(async () => {
      await wipe();
      await ingestion.runSource(FIXTURE_KEY, IngestionTrigger.MANUAL);
    });

    it('creates nothing the second time and re-stamps what it saw', async () => {
      const before = await prisma.jobPosting.count({
        where: { source: { key: FIXTURE_KEY } },
      });

      const second = await ingestion.runSource(
        FIXTURE_KEY,
        IngestionTrigger.MANUAL,
      );

      const after = await prisma.jobPosting.count({
        where: { source: { key: FIXTURE_KEY } },
      });

      expect(after).toBe(before);
      expect(second.created).toBe(0);
      // Unchanged payloads write no RawJobDocument, but the postings were still
      // seen — which is what M5.6's staleness sweep reads.
      expect(second.unchanged).toBe(second.fetched);
      expect(second.outcome).toBe('COMPLETED');
    });

    it('keeps exactly one current classification per job', async () => {
      const jobs = await prisma.job.findMany({
        where: { postings: { some: { source: { key: FIXTURE_KEY } } } },
        select: {
          id: true,
          _count: {
            select: { classifications: { where: { isCurrent: true } } },
          },
        },
      });

      for (const job of jobs) {
        expect(job._count.classifications).toBe(1);
      }
    });
  });
});
