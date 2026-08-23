import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ClassificationModule } from '../src/modules/classification/classification.module';
import { classificationInputHash } from '../src/modules/classification/classification-input-hash';
import { JobClassificationService } from '../src/modules/classification/job-classification.service';
import type { Signal } from '../src/modules/classification/signal';
import {
  RULE_BASED_CLASSIFIER_VERSION,
  RuleBasedClassifier,
} from '../src/modules/classification/rule-based.classifier';
import { SCORE_BANDS } from '../src/modules/scoring/score-bands';

/**
 * M8.4's Verify line, against a real database: re-running on unchanged text writes
 * no new row; a changed description creates one and moves `isCurrent`.
 *
 * A mock proves the service issues the statements it means to, and
 * `job-classification.service.spec.ts` does. What it cannot prove is the part the
 * database owns: that `(jobId, classifierVersion, inputHash)` really does keep the
 * old row when the description changes, and that the partial unique index really
 * does refuse a second `isCurrent` row per job. Both are asserted here.
 *
 * The classifier is the real `RuleBasedClassifier`, so the levels below are M8.3's
 * verdicts on M8.3's own corpus texts rather than fixtures invented for this file.
 * Only the clock is substituted, so `classifiedAt` is assertable rather than timed.
 *
 * Everything it writes carries the `m84-` company slug, so the seeded corpus is
 * never read, written, or cleaned up by mistake.
 */

/** The corpus's "silent body, neutral title" — the title decides, or nothing does. */
const SILENT_BODY =
  'We build tools for logistics companies. You will work with TypeScript and Postgres from our Berlin office.';

const JUNIOR_BODY =
  'This is an entry level position on our payments team. No prior experience is required, and training is provided.';

const EXPERIENCED_BODY =
  'We are looking for a developer to join our core banking group. Requirements: 5+ years of professional experience with Java and Spring Boot.';

describe('Classification persistence (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let service: JobClassificationService;

  /** Advanced by hand, so a write to `classifiedAt` is visible as a change. */
  let clock: Date;

  const COMPANY_SLUG = 'm84-vantage-payments';
  const FIRST_RUN = new Date('2026-08-23T09:00:00.000Z');

  async function wipe(): Promise<void> {
    // JobClassification cascades from Job, so the jobs are enough.
    await prisma.job.deleteMany({ where: { companySlug: COMPANY_SLUG } });
  }

  /** The `Job` row deduplication would have left behind, with no classification. */
  async function insertJob(
    title: string,
    description: string,
    suffix = '001',
  ): Promise<string> {
    const job = await prisma.job.create({
      data: {
        title,
        normalizedTitle: title.toLowerCase(),
        companyName: 'M84 Vantage Payments Ltd',
        companySlug: COMPANY_SLUG,
        location: 'Berlin, Germany',
        countryCode: 'DE',
        language: 'en',
        description,
        technologies: ['typescript'],
        dedupHash: `m84-${suffix}`,
        effectivePostedAt: new Date('2026-08-20T09:00:00.000Z'),
      },
      select: { id: true },
    });
    return job.id;
  }

  /** Re-reads the job as it is stored, not as the service reported it. */
  function readJob(id: string) {
    return prisma.job.findUniqueOrThrow({
      where: { id },
      select: {
        description: true,
        juniorLevel: true,
        juniorScore: true,
        requiredMinYears: true,
        requiredMaxYears: true,
        classifiedAt: true,
      },
    });
  }

  function readRows(jobId: string) {
    return prisma.jobClassification.findMany({
      where: { jobId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        classifierVersion: true,
        inputHash: true,
        level: true,
        score: true,
        minYears: true,
        maxYears: true,
        positiveSignals: true,
        negativeSignals: true,
        isCurrent: true,
        createdAt: true,
      },
    });
  }

  /** Classifies the job as it is stored now — the shape M5.4 will call. */
  async function classify(jobId: string) {
    const job = await prisma.job.findUniqueOrThrow({
      where: { id: jobId },
      select: { id: true, title: true, description: true },
    });
    return service.classifyAndPersist(job);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, ClassificationModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    clock = new Date(FIRST_RUN);
    service = new JobClassificationService(
      prisma,
      app.get(RuleBasedClassifier),
      undefined,
      () => clock,
    );

    await wipe();
  });

  afterAll(async () => {
    await wipe();
    await app.close();
  });

  beforeEach(async () => {
    await wipe();
    clock = new Date(FIRST_RUN);
  });

  it('resolves from the module graph', () => {
    expect(app.get(JobClassificationService)).toBeInstanceOf(
      JobClassificationService,
    );
  });

  describe('the first run on a job', () => {
    it('writes one current row with its version, hash and evidence', async () => {
      const jobId = await insertJob('Software Engineer', JUNIOR_BODY);

      const result = await classify(jobId);
      expect(result.outcome).toBe('CLASSIFIED');

      const rows = await readRows(jobId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        classifierVersion: RULE_BASED_CLASSIFIER_VERSION,
        inputHash: classificationInputHash({
          title: 'Software Engineer',
          description: JUNIOR_BODY,
        }),
        level: 'ENTRY_LEVEL',
        isCurrent: true,
      });

      // The evidence survives the JSON round trip verbatim — without it the level
      // cannot be explained on the job detail page (PRODUCT.md §7).
      const positive = rows[0].positiveSignals as unknown as Signal[];
      const stated = positive.find(
        (signal) => signal.code === 'ENTRY_LEVEL_STATED',
      );
      expect(stated?.weight).toBe(30);
      expect(stated?.evidence).toContain('entry level position');
      expect(rows[0].negativeSignals).toEqual([]);
    });

    it('denormalizes the current row onto the job', async () => {
      const jobId = await insertJob('Software Engineer', EXPERIENCED_BODY);

      await classify(jobId);

      const job = await readJob(jobId);

      expect(job).toMatchObject({
        juniorLevel: 'CLEARLY_EXPERIENCED',
        requiredMinYears: 5,
        requiredMaxYears: null,
        classifiedAt: FIRST_RUN,
      });

      // M8.5 bound `JUNIOR_SCORER`, so the number here is `ScoringService`'s and no
      // longer the placeholder zero. The assertion is the band rather than a
      // hard-coded figure: this file is about what persistence stores, and
      // `score-bands.spec.ts` owns where inside the band a posting lands.
      const band = SCORE_BANDS.CLEARLY_EXPERIENCED;
      expect(job.juniorScore).toBeGreaterThanOrEqual(band.min);
      expect(job.juniorScore).toBeLessThanOrEqual(band.max);
    });
  });

  describe('re-running on unchanged text', () => {
    it('writes no new row, and no row at all', async () => {
      const jobId = await insertJob('Software Engineer', JUNIOR_BODY);
      const first = await classify(jobId);
      const [before] = await readRows(jobId);

      clock = new Date('2026-08-24T09:00:00.000Z');
      const second = await classify(jobId);

      expect(second.outcome).toBe('CACHED');
      expect(second.classificationId).toBe(first.classificationId);

      const rows = await readRows(jobId);
      expect(rows).toHaveLength(1);
      expect(rows[0].createdAt).toEqual(before.createdAt);

      // `classifiedAt` did not move either: the advanced clock never reached a
      // write, which is what "skips re-classification" means for a stored row.
      expect((await readJob(jobId)).classifiedAt).toEqual(FIRST_RUN);
    });
  });

  describe('a description that changed', () => {
    it('creates a second row and moves isCurrent onto it', async () => {
      const jobId = await insertJob('Junior Developer', JUNIOR_BODY);
      const first = await classify(jobId);

      await prisma.job.update({
        where: { id: jobId },
        data: { description: EXPERIENCED_BODY },
      });
      clock = new Date('2026-08-24T09:00:00.000Z');
      const second = await classify(jobId);

      expect(second.outcome).toBe('CLASSIFIED');
      expect(second.classificationId).not.toBe(first.classificationId);

      const rows = await readRows(jobId);
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => [row.level, row.isCurrent])).toEqual([
        ['ENTRY_LEVEL', false],
        ['CLEARLY_EXPERIENCED', true],
      ]);

      // The history is the point: the old row is kept under the same version,
      // separated only by its input hash.
      expect(rows[0].classifierVersion).toBe(rows[1].classifierVersion);
      expect(rows[0].inputHash).not.toBe(rows[1].inputHash);

      expect(await readJob(jobId)).toMatchObject({
        juniorLevel: 'CLEARLY_EXPERIENCED',
        requiredMinYears: 5,
        classifiedAt: new Date('2026-08-24T09:00:00.000Z'),
      });
    });

    it('re-adopts the earlier row when the text changes back', async () => {
      const jobId = await insertJob('Junior Developer', JUNIOR_BODY);
      const first = await classify(jobId);

      await prisma.job.update({
        where: { id: jobId },
        data: { description: EXPERIENCED_BODY },
      });
      await classify(jobId);

      await prisma.job.update({
        where: { id: jobId },
        data: { description: JUNIOR_BODY },
      });
      const third = await classify(jobId);

      expect(third.outcome).toBe('CACHED');
      expect(third.classificationId).toBe(first.classificationId);

      const rows = await readRows(jobId);
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.isCurrent)).toEqual([true, false]);
      expect((await readJob(jobId)).juniorLevel).toBe('ENTRY_LEVEL');
    });
  });

  describe('a title that changed', () => {
    it('re-classifies, because the title is part of what was classified', async () => {
      const jobId = await insertJob('Software Engineer', SILENT_BODY);
      expect((await classify(jobId)).level).toBe('AMBIGUOUS');

      await prisma.job.update({
        where: { id: jobId },
        data: { title: 'Junior Software Engineer' },
      });
      const second = await classify(jobId);

      expect(second.outcome).toBe('CLASSIFIED');
      expect(second.level).toBe('LIKELY_ENTRY_LEVEL');
      expect(await readRows(jobId)).toHaveLength(2);
    });
  });

  describe('exactly one current row per job', () => {
    it('is enforced by the database, not only by the service', async () => {
      const jobId = await insertJob('Junior Developer', JUNIOR_BODY);
      await classify(jobId);
      await prisma.job.update({
        where: { id: jobId },
        data: { description: EXPERIENCED_BODY },
      });
      await classify(jobId);

      const [stoodDown] = await readRows(jobId);
      await expect(
        prisma.jobClassification.update({
          where: { id: stoodDown.id },
          data: { isCurrent: true },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });

      expect(
        await prisma.jobClassification.count({
          where: { jobId, isCurrent: true },
        }),
      ).toBe(1);
    });

    it('is per job — two jobs each keep their own', async () => {
      const juniorJob = await insertJob(
        'Software Engineer',
        JUNIOR_BODY,
        '002',
      );
      const seniorJob = await insertJob(
        'Software Engineer',
        EXPERIENCED_BODY,
        '003',
      );

      await classify(juniorJob);
      await classify(seniorJob);

      expect((await readJob(juniorJob)).juniorLevel).toBe('ENTRY_LEVEL');
      expect((await readJob(seniorJob)).juniorLevel).toBe(
        'CLEARLY_EXPERIENCED',
      );
      expect(
        await prisma.jobClassification.count({
          where: { jobId: { in: [juniorJob, seniorJob] }, isCurrent: true },
        }),
      ).toBe(2);
    });
  });
});
