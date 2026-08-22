import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { PaginatedResponse } from '../src/common/dto/paginated.response';
import { JobSummaryResponse } from '../src/modules/jobs/dto/job-summary.response';
import { JobDetailResponse } from '../src/modules/jobs/dto/job-detail.response';

// This suite creates and removes its own jobs rather than asserting against
// `npm run db:seed`, so it passes on a database that has never been seeded and
// leaves no rows behind. The shapes mirror the seed fixtures it stands in for:
// one job carried by two sources, one inactive job, one merged-away job.
const RUN_ID = randomUUID();
const SOURCE_KEY_PREFIX = `jobs-e2e-${RUN_ID}`;

function body<T>(res: request.Response): T {
  return res.body as T;
}

interface Fixtures {
  sourceIds: string[];
  canonicalJobId: string;
  inactiveJobId: string;
  mergedJobId: string;
}

describe('Jobs (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: Fixtures;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    fixtures = await createFixtures(prisma);
  });

  afterAll(async () => {
    if (fixtures) {
      // JobPosting survives its Job (onDelete: SetNull), and a JobSource cannot
      // be deleted while postings reference it — so postings go first. The
      // merged-away job holds an FK to the canonical one, so it goes before it.
      await prisma.jobPosting.deleteMany({
        where: { sourceId: { in: fixtures.sourceIds } },
      });
      await prisma.job.delete({ where: { id: fixtures.mergedJobId } });
      await prisma.job.deleteMany({
        where: {
          id: { in: [fixtures.canonicalJobId, fixtures.inactiveJobId] },
        },
      });
      await prisma.jobSource.deleteMany({
        where: { key: { startsWith: SOURCE_KEY_PREFIX } },
      });
    }
    await app.close();
  });

  const server = () => app.getHttpServer();

  describe('GET /jobs/:id', () => {
    it('returns the canonical detail with evidence and every source URL', async () => {
      const res = await request(server())
        .get(`/api/v1/jobs/${fixtures.canonicalJobId}`)
        .expect(200);

      const job = body<JobDetailResponse>(res);
      expect(job.id).toBe(fixtures.canonicalJobId);
      expect(job.title).toBe('Junior Backend Developer (Java)');
      expect(job.juniorLevel).toBe('ENTRY_LEVEL');
      expect(job.juniorScore).toBe(94);
      expect(job.redirectedFromJobId).toBeNull();

      // Classification evidence, verbatim (docs/DATABASE.md §4.1).
      expect(job.classification?.level).toBe('ENTRY_LEVEL');
      expect(job.classification?.positiveSignals).toEqual([
        {
          code: 'ENTRY_LEVEL_STATED',
          weight: 30,
          evidence: 'This is an entry level position.',
        },
      ]);
      expect(job.classification?.negativeSignals).toEqual([]);

      // Both sources carrying the job stay reachable.
      expect(job.sources).toHaveLength(2);
      expect(job.sources.map((source) => source.url).sort()).toEqual([
        `https://fixtures.juniorjob.local/board/${RUN_ID}`,
        `https://fixtures.juniorjob.local/feed/${RUN_ID}`,
      ]);
      expect(job.sources[0].attributionText).toBe(
        'Synthetic e2e data. Not a real job source.',
      );
    });

    it('never exposes internal Prisma columns', async () => {
      const res = await request(server())
        .get(`/api/v1/jobs/${fixtures.canonicalJobId}`)
        .expect(200);

      const job = body<Record<string, unknown>>(res);
      expect(job).not.toHaveProperty('dedupHash');
      expect(job).not.toHaveProperty('normalizedTitle');
      expect(job).not.toHaveProperty('companySlug');
      expect(job).not.toHaveProperty('searchVector');
      expect(job).not.toHaveProperty('postings');
    });

    it('resolves a merged-away job to the job it was merged into (D2)', async () => {
      const res = await request(server())
        .get(`/api/v1/jobs/${fixtures.mergedJobId}`)
        .expect(200);

      const job = body<JobDetailResponse>(res);
      expect(job.id).toBe(fixtures.canonicalJobId);
      expect(job.redirectedFromJobId).toBe(fixtures.mergedJobId);
      expect(job.sources).toHaveLength(2);
    });

    it('still serves an inactive job by id — only lists exclude it', async () => {
      const res = await request(server())
        .get(`/api/v1/jobs/${fixtures.inactiveJobId}`)
        .expect(200);

      expect(body<JobDetailResponse>(res).isActive).toBe(false);
    });

    it('is readable without a token', async () => {
      await request(server())
        .get(`/api/v1/jobs/${fixtures.canonicalJobId}`)
        .expect(200);
    });

    it('returns 404 for an unknown id and 400 for a malformed one', async () => {
      await request(server()).get(`/api/v1/jobs/${randomUUID()}`).expect(404);
      await request(server()).get('/api/v1/jobs/not-a-uuid').expect(400);
    });
  });

  describe('GET /jobs', () => {
    it('returns the { items, page, pageSize, total } envelope', async () => {
      const res = await request(server()).get('/api/v1/jobs').expect(200);

      const page = body<PaginatedResponse<JobSummaryResponse>>(res);
      expect(Array.isArray(page.items)).toBe(true);
      expect(page.page).toBe(1);
      expect(page.pageSize).toBe(20);
      expect(typeof page.total).toBe('number');
      expect(page.total).toBeGreaterThanOrEqual(1);
    });

    it('excludes inactive and merged jobs, and includes the canonical one', async () => {
      // The fixtures are the newest rows in the table, so one page of 50 holds
      // them regardless of what else the local database contains.
      const res = await request(server())
        .get('/api/v1/jobs?pageSize=50')
        .expect(200);

      const ids = body<PaginatedResponse<JobSummaryResponse>>(res).items.map(
        (item) => item.id,
      );
      expect(ids).toContain(fixtures.canonicalJobId);
      expect(ids).not.toContain(fixtures.inactiveJobId);
      expect(ids).not.toContain(fixtures.mergedJobId);
    });

    it('reports how many sources carry a job', async () => {
      const res = await request(server())
        .get('/api/v1/jobs?pageSize=50')
        .expect(200);

      const canonical = body<PaginatedResponse<JobSummaryResponse>>(
        res,
      ).items.find((item) => item.id === fixtures.canonicalJobId);
      expect(canonical?.sourceCount).toBe(2);
    });

    it('omits the description from list items', async () => {
      const res = await request(server())
        .get('/api/v1/jobs?pageSize=50')
        .expect(200);

      const canonical = body<PaginatedResponse<JobSummaryResponse>>(
        res,
      ).items.find((item) => item.id === fixtures.canonicalJobId);
      expect(canonical).not.toHaveProperty('description');
    });

    it('honours page and pageSize', async () => {
      const res = await request(server())
        .get('/api/v1/jobs?page=1&pageSize=1')
        .expect(200);

      const page = body<PaginatedResponse<JobSummaryResponse>>(res);
      expect(page.items).toHaveLength(1);
      expect(page.page).toBe(1);
      expect(page.pageSize).toBe(1);
    });

    it('rejects a pageSize above the 50 cap', async () => {
      await request(server()).get('/api/v1/jobs?pageSize=51').expect(400);
    });

    it('rejects a non-positive or non-integer page', async () => {
      await request(server()).get('/api/v1/jobs?page=0').expect(400);
      await request(server()).get('/api/v1/jobs?page=abc').expect(400);
      await request(server()).get('/api/v1/jobs?pageSize=1.5').expect(400);
    });

    it('rejects an unknown query parameter', async () => {
      await request(server()).get('/api/v1/jobs?sort=relevance').expect(400);
    });

    it('is readable without a token', async () => {
      await request(server()).get('/api/v1/jobs').expect(200);
    });
  });
});

async function createFixtures(prisma: PrismaService): Promise<Fixtures> {
  const attributionText = 'Synthetic e2e data. Not a real job source.';
  const board = await prisma.jobSource.create({
    data: {
      key: `${SOURCE_KEY_PREFIX}-board`,
      displayName: 'E2E Board',
      accessMethod: 'PUBLIC_API',
      attributionText,
    },
    select: { id: true },
  });
  const feed = await prisma.jobSource.create({
    data: {
      key: `${SOURCE_KEY_PREFIX}-feed`,
      displayName: 'E2E Feed',
      accessMethod: 'OFFICIAL_FEED',
      attributionText,
    },
    select: { id: true },
  });

  const now = new Date();
  const description =
    'This is an entry level position. No professional experience is required.';

  const canonical = await prisma.job.create({
    data: {
      title: 'Junior Backend Developer (Java)',
      normalizedTitle: 'backend developer java',
      companyName: 'E2E Systems Ltd',
      companySlug: `e2e-systems-${RUN_ID}`,
      location: 'Dublin',
      countryCode: 'IE',
      workplaceType: 'HYBRID',
      employmentType: 'FULL_TIME',
      language: 'en',
      description,
      technologies: ['java', 'spring-boot'],
      dedupHash: `e2e-canonical-${RUN_ID}`,
      postedAt: now,
      effectivePostedAt: now,
      isActive: true,
      juniorLevel: 'ENTRY_LEVEL',
      juniorScore: 94,
      requiredMinYears: 0,
      requiredMaxYears: 1,
      classifiedAt: now,
      classifications: {
        create: {
          classifierVersion: 'e2e-fixture-1.0',
          inputHash: `e2e-input-${RUN_ID}`,
          level: 'ENTRY_LEVEL',
          score: 94,
          minYears: 0,
          maxYears: 1,
          positiveSignals: [
            {
              code: 'ENTRY_LEVEL_STATED',
              weight: 30,
              evidence: 'This is an entry level position.',
            },
          ],
          negativeSignals: [],
          summary: 'States entry level outright.',
        },
      },
      postings: {
        create: [
          {
            sourceId: board.id,
            externalId: `board-${RUN_ID}`,
            url: `https://fixtures.juniorjob.local/board/${RUN_ID}`,
            title: 'Junior Backend Developer (Java)',
            companyName: 'E2E Systems Ltd',
            companySlug: `e2e-systems-${RUN_ID}`,
            language: 'en',
            description,
            contentHash: `e2e-content-board-${RUN_ID}`,
          },
          {
            sourceId: feed.id,
            externalId: `feed-${RUN_ID}`,
            url: `https://fixtures.juniorjob.local/feed/${RUN_ID}`,
            title: 'Junior Backend Developer (Java)',
            companyName: 'E2E Systems Ltd',
            companySlug: `e2e-systems-${RUN_ID}`,
            language: 'en',
            description,
            contentHash: `e2e-content-feed-${RUN_ID}`,
          },
        ],
      },
    },
    select: { id: true },
  });

  const inactive = await prisma.job.create({
    data: {
      title: 'Junior QA Engineer',
      normalizedTitle: 'qa engineer',
      companyName: 'E2E Systems Ltd',
      companySlug: `e2e-systems-${RUN_ID}`,
      language: 'en',
      description: 'Filled role, kept for anyone who saved it.',
      technologies: [],
      dedupHash: `e2e-inactive-${RUN_ID}`,
      effectivePostedAt: now,
      isActive: false,
    },
    select: { id: true },
  });

  const merged = await prisma.job.create({
    data: {
      title: 'Graduate Backend Developer',
      normalizedTitle: 'backend developer',
      companyName: 'E2E Systems Ltd',
      companySlug: `e2e-systems-${RUN_ID}`,
      language: 'en',
      description: 'The same vacancy under a different title.',
      technologies: [],
      dedupHash: `e2e-merged-${RUN_ID}`,
      effectivePostedAt: now,
      isActive: true,
      mergedIntoJobId: canonical.id,
    },
    select: { id: true },
  });

  return {
    sourceIds: [board.id, feed.id],
    canonicalJobId: canonical.id,
    inactiveJobId: inactive.id,
    mergedJobId: merged.id,
  };
}
