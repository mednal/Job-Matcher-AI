import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DeduplicationModule } from '../src/modules/deduplication/deduplication.module';
import {
  CanonicalJobService,
  type ClusterAssignment,
} from '../src/modules/deduplication/canonical-job.service';
import { dedupHash } from '../src/modules/deduplication/dedup-hash';
import { toNormalizedTitle } from '../src/modules/deduplication/normalized-title';
import type { NormalizedPosting } from '../src/modules/deduplication/posting-identity.service';
import { FIXTURE_SOURCE_KEY } from '../src/modules/sources/adapters/fixture/fixture-source.adapter';

/**
 * M7.2's Verify line, against a real database: the concurrency test that exercises
 * the `dedupHash` retry path (D1).
 *
 * A mock can prove the `P2002` branch is wired correctly, and the unit spec does.
 * What it cannot prove is that the constraint actually fires — that requires two
 * writers racing on a real UNIQUE index, which is what this file does.
 *
 * Everything it writes is prefixed `t2-` / `tier2-`, so the seeded corpus is never
 * read, written, or cleaned up by mistake.
 */
describe('Deduplication tier 2 — canonical hash (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let canonical: CanonicalJobService;
  let sourceId: string;

  /** Advanced by hand, so `lastSeenAt` movement is assertable rather than timed. */
  let clock: Date;

  const EXTERNAL_ID_PREFIX = 't2-';
  const COMPANY_SLUG = 'tier2-vantage-payments';

  function posting(
    overrides: Partial<NormalizedPosting> = {},
  ): NormalizedPosting {
    return {
      sourceId,
      externalId: `${EXTERNAL_ID_PREFIX}001`,
      url: 'https://fixtures.juniorjob.local/jobs/t2-001',
      title: 'Junior Java Developer (m/w/d)',
      companyName: 'Tier2 Vantage Payments Ltd',
      companySlug: COMPANY_SLUG,
      location: 'Dublin, Ireland',
      countryCode: 'IE',
      workplaceType: 'HYBRID',
      employmentType: 'FULL_TIME',
      language: 'en',
      description: 'Entry level position. Training provided.',
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
        contentHash: `t2-${input.externalId}`,
        postedAt: input.postedAt,
      },
      select: { id: true },
    });
    return row.id;
  }

  async function wipe(): Promise<void> {
    if (!sourceId) {
      return;
    }
    await prisma.jobPosting.deleteMany({
      where: { sourceId, externalId: { startsWith: EXTERNAL_ID_PREFIX } },
    });
    // Postings are detached by `onDelete: SetNull`, so the jobs go second.
    await prisma.job.deleteMany({ where: { companySlug: COMPANY_SLUG } });
  }

  async function countJobs(): Promise<number> {
    return prisma.job.count({ where: { companySlug: COMPANY_SLUG } });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, DeduplicationModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    clock = new Date('2026-08-22T09:00:00.000Z');
    canonical = new CanonicalJobService(prisma, () => clock);

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
    await wipe();
  });

  afterAll(async () => {
    await wipe();
    await app.close();
  });

  beforeEach(async () => {
    await wipe();
    clock = new Date('2026-08-22T09:00:00.000Z');
  });

  it('resolves through the module graph', () => {
    expect(app.get(CanonicalJobService)).toBeInstanceOf(CanonicalJobService);
  });

  describe('a posting with no matching hash', () => {
    it('opens one canonical job carrying the stored normalized title', async () => {
      const input = posting();
      const postingId = await insertPosting(input);

      const result = await canonical.assign(input, { postingId, jobId: null });

      expect(result.outcome).toBe('CREATED');
      expect(await countJobs()).toBe(1);

      const job = await prisma.job.findUniqueOrThrow({
        where: { id: result.jobId },
        select: {
          normalizedTitle: true,
          dedupHash: true,
          title: true,
          effectivePostedAt: true,
          juniorLevel: true,
        },
      });

      // Stored, not only hashed: tier 3 runs trigram similarity against it.
      expect(job.normalizedTitle).toBe('java developer');
      expect(job.dedupHash).toBe(
        dedupHash({
          companySlug: COMPANY_SLUG,
          normalizedTitle: 'java developer',
          countryCode: 'IE',
        }),
      );
      expect(job.title).toBe('Junior Java Developer (m/w/d)');
      expect(job.effectivePostedAt).toEqual(input.postedAt);
      // Phase 8 fills the classification block; a placeholder would be
      // indistinguishable from a real verdict in search.
      expect(job.juniorLevel).toBeNull();

      const stored = await prisma.jobPosting.findUniqueOrThrow({
        where: { id: postingId },
        select: { jobId: true },
      });
      expect(stored.jobId).toBe(result.jobId);
    });
  });

  describe('a second posting of the same vacancy', () => {
    it('joins the existing job instead of opening a second', async () => {
      const first = posting();
      const firstId = await insertPosting(first);
      const created = await canonical.assign(first, {
        postingId: firstId,
        jobId: null,
      });

      // Written differently by the second listing — the seniority word and the
      // gender marker are exactly what `normalizedTitle` removes. The hash carries
      // no source id, so a second listing on another source takes this same path.
      const second = posting({
        externalId: `${EXTERNAL_ID_PREFIX}002`,
        url: 'https://fixtures.juniorjob.local/jobs/t2-002',
        title: 'Java Developer',
      });
      const secondId = await insertPosting(second);

      clock = new Date('2026-08-22T10:00:00.000Z');
      const matched = await canonical.assign(second, {
        postingId: secondId,
        jobId: null,
      });

      expect(matched.outcome).toBe('MATCHED');
      expect(matched.jobId).toBe(created.jobId);
      expect(await countJobs()).toBe(1);

      const job = await prisma.job.findUniqueOrThrow({
        where: { id: created.jobId },
        select: { lastSeenAt: true, firstSeenAt: true, postings: true },
      });
      expect(job.postings).toHaveLength(2);
      // The staleness sweep (M5.6) retires by `lastSeenAt`; both postings were
      // seen in this run.
      expect(job.lastSeenAt).toEqual(new Date('2026-08-22T10:00:00.000Z'));
      expect(job.firstSeenAt).toEqual(new Date('2026-08-22T09:00:00.000Z'));
    });

    it('does not join a same-titled vacancy in another country', async () => {
      const ie = posting();
      const ieId = await insertPosting(ie);
      const created = await canonical.assign(ie, {
        postingId: ieId,
        jobId: null,
      });

      const de = posting({
        externalId: `${EXTERNAL_ID_PREFIX}003`,
        countryCode: 'DE',
        location: 'Berlin, Germany',
      });
      const deId = await insertPosting(de);
      const split = await canonical.assign(de, {
        postingId: deId,
        jobId: null,
      });

      // `countryCode` is a hash input, so two countries stay two vacancies. A false
      // split is the cheap error here; a false merge hides a real job (§6.3).
      expect(split.outcome).toBe('CREATED');
      expect(split.jobId).not.toBe(created.jobId);
      expect(await countJobs()).toBe(2);
    });
  });

  describe('two runs racing on the same dedupHash', () => {
    it('leave one canonical job, with the loser retried as a match', async () => {
      // Two postings of the same vacancy, assigned concurrently — the real race the
      // UNIQUE index exists for (D1). Whether the loser catches `P2002` or simply
      // reads the winner's row first depends on timing, and both are correct; what
      // must never happen is two canonical jobs, or a posting left unclustered.
      const inputs = [
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}r1`,
          url: 'https://fixtures.juniorjob.local/jobs/t2-r1',
        }),
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}r2`,
          url: 'https://fixtures.juniorjob.local/jobs/t2-r2',
        }),
      ];
      const ids = await Promise.all(inputs.map(insertPosting));

      const results: ClusterAssignment[] = await Promise.all(
        inputs.map((input, i) =>
          canonical.assign(input, { postingId: ids[i], jobId: null }),
        ),
      );

      expect(await countJobs()).toBe(1);
      expect(results[0].dedupHash).toBe(results[1].dedupHash);
      expect(results[0].jobId).toBe(results[1].jobId);
      expect(results.filter((r) => r.outcome === 'CREATED')).toHaveLength(1);
      expect(results.filter((r) => r.outcome === 'MATCHED')).toHaveLength(1);

      const attached = await prisma.jobPosting.findMany({
        where: { id: { in: ids } },
        select: { jobId: true },
      });
      expect(attached.every((row) => row.jobId === results[0].jobId)).toBe(
        true,
      );
    });

    it('holds under a wider burst', async () => {
      const inputs = Array.from({ length: 8 }, (_, i) =>
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}b${i}`,
          url: `https://fixtures.juniorjob.local/jobs/t2-b${i}`,
        }),
      );
      const ids = await Promise.all(inputs.map(insertPosting));

      const results = await Promise.all(
        inputs.map((input, i) =>
          canonical.assign(input, { postingId: ids[i], jobId: null }),
        ),
      );

      expect(await countJobs()).toBe(1);
      expect(new Set(results.map((r) => r.jobId)).size).toBe(1);
      expect(results.filter((r) => r.outcome === 'CREATED')).toHaveLength(1);
    });
  });

  /**
   * The recorded hazard of `normalized-title.ts`, pinned so it is visible rather
   * than latent. Stripping seniority words is what `ARCHITECTURE.md` §6.3,
   * `DATABASE.md` §6 and this milestone specify, and `dedupHash` is UNIQUE (D1) —
   * so the schema *cannot* hold a junior and a senior listing of one title at one
   * company in one country as two vacancies.
   *
   * This test asserts the specified behaviour, not the desirable one. For a product
   * whose value is telling entry-level roles from experienced ones, it is the
   * expensive direction of error, and changing it is a product decision plus the
   * recompute migration of `DATABASE.md` §6.
   */
  describe('KNOWN HAZARD: seniority is not part of the key', () => {
    it('merges a junior and a senior listing of the same title', async () => {
      const junior = posting();
      const juniorId = await insertPosting(junior);
      const created = await canonical.assign(junior, {
        postingId: juniorId,
        jobId: null,
      });

      const senior = posting({
        externalId: `${EXTERNAL_ID_PREFIX}snr`,
        url: 'https://fixtures.juniorjob.local/jobs/t2-snr',
        title: 'Senior Java Developer',
        description: '8+ years of professional experience required.',
      });
      const seniorId = await insertPosting(senior);
      const result = await canonical.assign(senior, {
        postingId: seniorId,
        jobId: null,
      });

      expect(result.outcome).toBe('MATCHED');
      expect(result.jobId).toBe(created.jobId);
      expect(await countJobs()).toBe(1);
    });
  });

  describe('a posting that is already clustered', () => {
    it('keeps its job across a re-ingestion that changed the title', async () => {
      const input = posting();
      const postingId = await insertPosting(input);
      const created = await canonical.assign(input, { postingId, jobId: null });

      clock = new Date('2026-08-22T11:00:00.000Z');
      const rerun = await canonical.assign(
        posting({ title: 'Completely Different Role' }),
        { postingId, jobId: created.jobId },
      );

      // Re-ingestion must never silently undo clustering (the rule tier 1 states).
      expect(rerun).toMatchObject({
        outcome: 'ALREADY_CLUSTERED',
        jobId: created.jobId,
      });
      expect(await countJobs()).toBe(1);

      const job = await prisma.job.findUniqueOrThrow({
        where: { id: created.jobId },
        select: { title: true, lastSeenAt: true },
      });
      // Canonical values are M7.4's to choose; only the seen-at stamp moves.
      expect(job.title).toBe('Junior Java Developer (m/w/d)');
      expect(job.lastSeenAt).toEqual(new Date('2026-08-22T11:00:00.000Z'));
    });
  });

  describe('a job that was merged away', () => {
    it('takes the posting to the survivor, not the tombstone', async () => {
      const input = posting();
      const postingId = await insertPosting(input);
      const loser = await canonical.assign(input, { postingId, jobId: null });

      const survivor = await prisma.job.create({
        data: {
          dedupHash: `t2-survivor-${Date.now()}`,
          title: 'Java Developer',
          normalizedTitle: toNormalizedTitle('Java Developer'),
          companyName: 'Tier2 Vantage Payments Ltd',
          companySlug: COMPANY_SLUG,
          countryCode: 'IE',
          language: 'en',
          description: 'The richer listing of the same vacancy.',
          technologies: [],
          effectivePostedAt: new Date('2026-08-20T09:00:00.000Z'),
        },
        select: { id: true },
      });
      await prisma.job.update({
        where: { id: loser.jobId },
        data: { mergedIntoJobId: survivor.id },
      });

      const next = posting({
        externalId: `${EXTERNAL_ID_PREFIX}004`,
        url: 'https://fixtures.juniorjob.local/jobs/t2-004',
      });
      const nextId = await insertPosting(next);
      const result = await canonical.assign(next, {
        postingId: nextId,
        jobId: null,
      });

      // Search excludes a merged row (D2), so attaching there would hide the
      // vacancy while leaving the posting technically clustered.
      expect(result.outcome).toBe('MATCHED');
      expect(result.jobId).toBe(survivor.id);
    });
  });
});
