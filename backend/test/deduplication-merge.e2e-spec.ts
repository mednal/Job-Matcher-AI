import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DeduplicationModule } from '../src/modules/deduplication/deduplication.module';
import { CanonicalJobService } from '../src/modules/deduplication/canonical-job.service';
import { CanonicalValuesService } from '../src/modules/deduplication/canonical-values.service';
import { JobMergeService } from '../src/modules/deduplication/job-merge.service';
import type { FuzzyMatcher } from '../src/modules/deduplication/fuzzy-match.service';
import type { NormalizedPosting } from '../src/modules/deduplication/posting-identity.service';
import { PaginatedResponse } from '../src/common/dto/paginated.response';
import { JobSummaryResponse } from '../src/modules/jobs/dto/job-summary.response';
import { JobDetailResponse } from '../src/modules/jobs/dto/job-detail.response';
import { FIXTURE_SOURCE_KEY } from '../src/modules/sources/adapters/fixture/fixture-source.adapter';

/**
 * M7.4's Verify line, against a real database: **save a job, merge it, the saved
 * job still loads** — plus the two halves that line depends on, canonical values
 * chosen from the richest posting and a merge that redirects rather than deletes.
 *
 * It has to be an integration test. The saved job resolving through the redirect is
 * a claim about three components agreeing — `JobMergeService` writing the tombstone,
 * the `SavedJob` FK surviving it, and `JobsService` walking it — and each of those
 * is only mocked away by testing them apart.
 *
 * Tier 3 is switched off with a matcher that never matches, so every clustering
 * decision below is tier 2's exact hash and the cases stay statements about
 * merging. Everything written is prefixed `t4-` / `tier4-`, so the seeded corpus is
 * never read, written or cleaned up by mistake.
 */

/** Tier 3 disabled: see the suite comment. M7.3 has its own e2e. */
const NO_FUZZY_MATCH: FuzzyMatcher = { findMatch: () => Promise.resolve(null) };

const TEST_EMAIL_DOMAIN = 'merge-e2e.invalid';

function body<T>(res: request.Response): T {
  return res.body as T;
}

describe('Deduplication merge and redirect (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let canonical: CanonicalJobService;
  let merger: JobMergeService;
  let sourceId: string;
  let userId: string;

  /** Advanced by hand, so `lastSeenAt` movement is assertable rather than timed. */
  let clock: Date;

  const EXTERNAL_ID_PREFIX = 't4-';
  const COMPANY_SLUG = 'tier4-nordwind-software';

  /** The shorter of the two copies of one vacancy. */
  const THIN_AD = 'Backend developer wanted in Berlin. Java and Spring Boot.';

  /** The same vacancy as a second board carries it — more of the actual ad. */
  const RICH_AD =
    'We are hiring a backend developer for our payments platform in Berlin. ' +
    'You will work with Java, Spring Boot and PostgreSQL, ship to production ' +
    'every week and review pull requests with your team. A mentor is provided ' +
    'for the first six months, and recent graduates are welcome to apply.';

  function posting(
    overrides: Partial<NormalizedPosting> = {},
  ): NormalizedPosting {
    return {
      sourceId,
      externalId: `${EXTERNAL_ID_PREFIX}001`,
      url: 'https://fixtures.juniorjob.local/jobs/t4-001',
      title: 'Backend Developer (m/w/d)',
      companyName: 'Tier4 Nordwind Software GmbH',
      companySlug: COMPANY_SLUG,
      location: 'Berlin, Germany',
      countryCode: 'DE',
      workplaceType: 'HYBRID',
      employmentType: 'FULL_TIME',
      language: 'en',
      description: THIN_AD,
      technologies: ['java', 'spring-boot'],
      postedAt: new Date('2026-08-20T09:00:00.000Z'),
      ...overrides,
    };
  }

  /** Writes the `JobPosting` row tier 1 would have written, without clustering it. */
  async function insertPosting(input: NormalizedPosting): Promise<string> {
    const row = await prisma.jobPosting.create({
      data: {
        sourceId: input.sourceId,
        externalId: input.externalId,
        url: input.url,
        title: input.title,
        companyName: input.companyName,
        companySlug: input.companySlug,
        location: input.location,
        countryCode: input.countryCode,
        workplaceType: input.workplaceType,
        employmentType: input.employmentType,
        language: input.language,
        description: input.description,
        technologies: [...input.technologies],
        contentHash: `t4-${input.externalId}`,
        postedAt: input.postedAt,
        firstSeenAt: clock,
        lastSeenAt: clock,
      },
      select: { id: true },
    });
    return row.id;
  }

  /** Inserts and clusters one posting, the way the M5.4 orchestrator will. */
  async function ingest(input: NormalizedPosting) {
    const postingId = await insertPosting(input);
    const result = await canonical.assign(input, { postingId, jobId: null });
    return { postingId, ...result };
  }

  async function wipe(): Promise<void> {
    if (!sourceId) {
      return;
    }
    await prisma.savedJob.deleteMany({ where: { userId } });
    await prisma.jobPosting.deleteMany({
      where: { sourceId, externalId: { startsWith: EXTERNAL_ID_PREFIX } },
    });
    // Postings are detached by `onDelete: SetNull`, so the jobs go second — and a
    // merge redirect has to be cleared before its survivor can be deleted.
    await prisma.job.updateMany({
      where: { companySlug: COMPANY_SLUG },
      data: { mergedIntoJobId: null },
    });
    await prisma.job.deleteMany({ where: { companySlug: COMPANY_SLUG } });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, DeduplicationModule],
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

    clock = new Date('2026-08-22T09:00:00.000Z');
    const values = new CanonicalValuesService(prisma);
    canonical = new CanonicalJobService(
      prisma,
      () => clock,
      NO_FUZZY_MATCH,
      values,
    );
    merger = new JobMergeService(prisma, values);

    const source = await prisma.jobSource.upsert({
      where: { key: FIXTURE_SOURCE_KEY },
      create: {
        key: FIXTURE_SOURCE_KEY,
        displayName: 'Fixture Job Board (development only)',
        accessMethod: 'OFFICIAL_FEED',
        termsUrl: null,
        attributionText: 'Synthetic development data.',
      },
      update: {},
      select: { id: true },
    });
    sourceId = source.id;

    // Saving a job needs an owner. Written directly rather than registered: this
    // suite is about the redirect, and the FK is all it needs from auth.
    const user = await prisma.user.upsert({
      where: { email: `saver@${TEST_EMAIL_DOMAIN}` },
      create: {
        email: `saver@${TEST_EMAIL_DOMAIN}`,
        passwordHash: 'not-a-real-hash-this-user-never-logs-in',
      },
      update: {},
      select: { id: true },
    });
    userId = user.id;

    await wipe();
  });

  afterAll(async () => {
    await wipe();
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app.close();
  });

  beforeEach(async () => {
    await wipe();
    clock = new Date('2026-08-22T09:00:00.000Z');
  });

  const server = () => app.getHttpServer();

  it('resolves through the module graph', () => {
    expect(app.get(JobMergeService)).toBeInstanceOf(JobMergeService);
    expect(app.get(CanonicalValuesService)).toBeInstanceOf(
      CanonicalValuesService,
    );
  });

  describe('canonical values across a cluster', () => {
    it('takes them from the posting with the richest description', async () => {
      const first = await ingest(posting());

      clock = new Date('2026-08-22T10:00:00.000Z');
      const second = await ingest(
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}002`,
          url: 'https://fixtures.juniorjob.local/jobs/t4-002',
          // Normalizes to the same `backend developer` — the seniority word is
          // stripped — so tier 2 clusters it while the display title differs.
          title: 'Junior Backend Developer (m/w/d)',
          description: RICH_AD,
          technologies: ['java', 'spring-boot', 'postgresql'],
        }),
      );

      // Tier 2 clustered them: same slug, same normalized title, same country.
      expect(second.outcome).toBe('MATCHED');
      expect(second.jobId).toBe(first.jobId);

      const job = await prisma.job.findUniqueOrThrow({
        where: { id: first.jobId },
        select: {
          title: true,
          description: true,
          technologies: true,
          normalizedTitle: true,
          dedupHash: true,
        },
      });
      expect(job.description).toBe(RICH_AD);
      expect(job.title).toBe('Junior Backend Developer (m/w/d)');
      expect(job.technologies).toEqual(['java', 'spring-boot', 'postgresql']);
      // Identity is frozen even as the display copy moves: `dedupHash` is UNIQUE
      // and derived from `normalizedTitle`, so a recomputed one could collide with
      // a hash another job already holds.
      expect(job.normalizedTitle).toBe('backend developer');
      expect(job.dedupHash).toBe(first.dedupHash);
    });

    it('hands the copy back to a live posting when the richest one retires', async () => {
      const first = await ingest(posting());
      const second = await ingest(
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}002`,
          url: 'https://fixtures.juniorjob.local/jobs/t4-002',
          description: RICH_AD,
        }),
      );
      expect(second.jobId).toBe(first.jobId);

      // What the M5.6 staleness sweep will do when a source stops listing it.
      await prisma.jobPosting.update({
        where: { id: second.postingId },
        data: { isActive: false },
      });

      // The next run re-sees the surviving posting; it is already clustered.
      clock = new Date('2026-08-22T11:00:00.000Z');
      const rerun = await canonical.assign(posting(), {
        postingId: first.postingId,
        jobId: first.jobId,
      });
      expect(rerun.outcome).toBe('ALREADY_CLUSTERED');

      const job = await prisma.job.findUniqueOrThrow({
        where: { id: first.jobId },
        select: { description: true },
      });
      expect(job.description).toBe(THIN_AD);
    });
  });

  describe('merging one job into another', () => {
    /** Two jobs for one vacancy — the false split tier 3 is biased toward. */
    async function split() {
      const loser = await ingest(posting());
      const winner = await ingest(
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}002`,
          url: 'https://fixtures.juniorjob.local/jobs/t4-002',
          // A different normalized title, so tier 2 opens a second job.
          title: 'Backend Engineer (m/w/d)',
          description: RICH_AD,
        }),
      );
      expect(winner.outcome).toBe('CREATED');
      expect(winner.jobId).not.toBe(loser.jobId);
      return { loser, winner };
    }

    it('retains the loser as a redirect and moves its postings', async () => {
      const { loser, winner } = await split();

      const result = await merger.merge(loser.jobId, winner.jobId);

      expect(result).toMatchObject({
        outcome: 'MERGED',
        winnerId: winner.jobId,
        loserId: loser.jobId,
        movedPostings: 1,
      });

      const tombstone = await prisma.job.findUniqueOrThrow({
        where: { id: loser.jobId },
        select: { mergedIntoJobId: true, dedupHash: true },
      });
      // D2: retained, not deleted — that is what keeps a `SavedJob` valid.
      expect(tombstone.mergedIntoJobId).toBe(winner.jobId);
      expect(tombstone.dedupHash).toBe(loser.dedupHash);

      const postings = await prisma.jobPosting.findMany({
        where: { companySlug: COMPANY_SLUG },
        select: { jobId: true },
      });
      expect(postings).toHaveLength(2);
      expect(postings.every((p) => p.jobId === winner.jobId)).toBe(true);
    });

    it('re-derives the surviving job values over the postings it gained', async () => {
      // The loser here carries the richer ad, so the merge has to move the
      // canonical copy onto the winner — otherwise the survivor would keep
      // describing the vacancy with the thinner of the two texts.
      const loser = await ingest(posting({ description: RICH_AD }));
      const winner = await ingest(
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}002`,
          url: 'https://fixtures.juniorjob.local/jobs/t4-002',
          title: 'Backend Engineer (m/w/d)',
          description: THIN_AD,
        }),
      );

      await merger.merge(loser.jobId, winner.jobId);

      const job = await prisma.job.findUniqueOrThrow({
        where: { id: winner.jobId },
        select: { description: true },
      });
      expect(job.description).toBe(RICH_AD);
    });

    it('is idempotent — merging again changes nothing', async () => {
      const { loser, winner } = await split();
      await merger.merge(loser.jobId, winner.jobId);

      const again = await merger.merge(loser.jobId, winner.jobId);

      expect(again).toMatchObject({
        outcome: 'ALREADY_MERGED',
        winnerId: winner.jobId,
        movedPostings: 0,
      });
    });

    it('lands on the survivor when the target was itself merged away', async () => {
      const { loser, winner } = await split();
      await merger.merge(loser.jobId, winner.jobId);

      const third = await ingest(
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}003`,
          url: 'https://fixtures.juniorjob.local/jobs/t4-003',
          title: 'Backend Programmer (m/w/d)',
        }),
      );

      // Merging into the tombstone: the chain must be followed, not extended.
      const result = await merger.merge(third.jobId, loser.jobId);

      expect(result.winnerId).toBe(winner.jobId);
      const tombstone = await prisma.job.findUniqueOrThrow({
        where: { id: third.jobId },
        select: { mergedIntoJobId: true },
      });
      expect(tombstone.mergedIntoJobId).toBe(winner.jobId);
    });

    it('re-points an existing tombstone instead of chaining through the loser', async () => {
      const { loser, winner } = await split();
      const third = await ingest(
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}003`,
          url: 'https://fixtures.juniorjob.local/jobs/t4-003',
          title: 'Backend Programmer (m/w/d)',
        }),
      );

      // third → loser, then loser → winner. Left alone, third would reach the
      // survivor only by two hops, and every later merge would add another.
      await merger.merge(third.jobId, loser.jobId);
      const result = await merger.merge(loser.jobId, winner.jobId);

      expect(result.repointedRedirects).toBe(1);
      const rows = await prisma.job.findMany({
        where: { id: { in: [third.jobId, loser.jobId] } },
        select: { id: true, mergedIntoJobId: true },
      });
      expect(rows.every((r) => r.mergedIntoJobId === winner.jobId)).toBe(true);
    });

    it('sends a later posting of the losing spelling to the survivor', async () => {
      const { loser, winner } = await split();
      await merger.merge(loser.jobId, winner.jobId);

      // The tombstone keeps its `dedupHash`, so tier 2 still finds it by hash —
      // and follows the redirect rather than opening a third job.
      const later = await ingest(
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}004`,
          url: 'https://fixtures.juniorjob.local/jobs/t4-004',
        }),
      );

      expect(later).toMatchObject({
        outcome: 'MATCHED',
        jobId: winner.jobId,
        dedupHash: loser.dedupHash,
      });
    });
  });

  describe('what a merged job does to the read side', () => {
    it('drops out of the job list', async () => {
      const loser = await ingest(posting());
      const winner = await ingest(
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}002`,
          url: 'https://fixtures.juniorjob.local/jobs/t4-002',
          title: 'Backend Engineer (m/w/d)',
        }),
      );
      await merger.merge(loser.jobId, winner.jobId);

      const res = await request(server())
        .get('/api/v1/jobs?pageSize=50')
        .expect(200);
      const ids = body<PaginatedResponse<JobSummaryResponse>>(res).items.map(
        (item) => item.id,
      );

      // `mergedIntoJobId IS NULL` (D2): one vacancy, listed once.
      expect(ids).toContain(winner.jobId);
      expect(ids).not.toContain(loser.jobId);
    });

    // The milestone's Verify line.
    it('still loads a saved job after the job it points at is merged away', async () => {
      const loser = await ingest(posting());
      const winner = await ingest(
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}002`,
          url: 'https://fixtures.juniorjob.local/jobs/t4-002',
          title: 'Backend Engineer (m/w/d)',
          description: RICH_AD,
        }),
      );

      // The user saves the job as they found it — the row that is about to lose.
      await prisma.savedJob.create({
        data: { userId, jobId: loser.jobId },
      });

      await merger.merge(loser.jobId, winner.jobId);

      // The save still points at a real row; nothing had to be rewritten for it.
      const saved = await prisma.savedJob.findFirstOrThrow({
        where: { userId },
        select: { jobId: true },
      });
      expect(saved.jobId).toBe(loser.jobId);

      // And opening it serves the survivor rather than a dead row — the entire
      // reason D2 chose a tombstone over a delete.
      const res = await request(server())
        .get(`/api/v1/jobs/${loser.jobId}`)
        .expect(200);
      const detail = body<JobDetailResponse>(res);

      expect(detail.id).toBe(winner.jobId);
      expect(detail.redirectedFromJobId).toBe(loser.jobId);
      // Both source listings are reachable from the survivor (§6.3).
      expect(detail.sources).toHaveLength(2);
    });
  });
});
