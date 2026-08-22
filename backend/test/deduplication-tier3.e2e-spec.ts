import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DeduplicationModule } from '../src/modules/deduplication/deduplication.module';
import { CanonicalJobService } from '../src/modules/deduplication/canonical-job.service';
import { CanonicalValuesService } from '../src/modules/deduplication/canonical-values.service';
import { FuzzyMatchService } from '../src/modules/deduplication/fuzzy-match.service';
import { toNormalizedTitle } from '../src/modules/deduplication/normalized-title';
import type { NormalizedPosting } from '../src/modules/deduplication/posting-identity.service';
import { FIXTURE_SOURCE_KEY } from '../src/modules/sources/adapters/fixture/fixture-source.adapter';

/**
 * M7.3's Verify line, against a real database: near-identical titles merge,
 * genuinely different roles at one company stay separate.
 *
 * It has to be an integration test. Tier 3's first gate is `similarity()` — a
 * `pg_trgm` function — so a mock can prove which candidate the service picks but
 * never that Postgres offered that candidate in the first place, nor that the
 * `companySlug` scope holds.
 *
 * Everything it writes is prefixed `t3-` / `tier3-`, so the seeded corpus is never
 * read, written, or cleaned up by mistake.
 */
describe('Deduplication tier 3 — fuzzy match (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let canonical: CanonicalJobService;
  let sourceId: string;

  /** Advanced by hand, so `lastSeenAt` movement is assertable rather than timed. */
  let clock: Date;

  const EXTERNAL_ID_PREFIX = 't3-';
  const COMPANY_SLUG = 'tier3-nordwind-software';
  const OTHER_COMPANY_SLUG = 'tier3-other-company';

  /** A real-length ad: tier 3 refuses to confirm on a two-line description. */
  const BACKEND_AD = `
    We are hiring a backend developer for our payments platform in Berlin. You will
    work with Java, Spring Boot and PostgreSQL, ship features to production every
    week, and review pull requests together with your team. Training and a mentor
    are provided for the first six months. Recent graduates are welcome to apply.
  `;

  /** The same vacancy as a second board wrote it — same copy, different wrapper. */
  const BACKEND_AD_REPOSTED = `
    Backend developer wanted for our payments platform in Berlin. You will work with
    Java, Spring Boot and PostgreSQL, ship features to production every week and
    review pull requests with your team. A mentor is provided for the first six
    months. Recent graduates welcome. We offer thirty vacation days.
  `;

  /** Another role at the same company, sharing only the company boilerplate. */
  const DATA_AD = `
    We are hiring a data engineer for our analytics platform in Berlin. You will
    build streaming pipelines with Kafka, dbt and Snowflake, own the warehouse
    schema and partner with analysts across the company. We offer thirty vacation
    days and a public transport ticket.
  `;

  function posting(
    overrides: Partial<NormalizedPosting> = {},
  ): NormalizedPosting {
    return {
      sourceId,
      externalId: `${EXTERNAL_ID_PREFIX}001`,
      url: 'https://fixtures.juniorjob.local/jobs/t3-001',
      title: 'Backend Developer (m/w/d)',
      companyName: 'Tier3 Nordwind Software GmbH',
      companySlug: COMPANY_SLUG,
      location: 'Berlin, Germany',
      countryCode: 'DE',
      workplaceType: 'HYBRID',
      employmentType: 'FULL_TIME',
      language: 'en',
      description: BACKEND_AD,
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
        contentHash: `t3-${input.externalId}`,
        postedAt: input.postedAt,
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
    await prisma.jobPosting.deleteMany({
      where: { sourceId, externalId: { startsWith: EXTERNAL_ID_PREFIX } },
    });
    // Postings are detached by `onDelete: SetNull`, so the jobs go second — and a
    // merge redirect has to be cleared before its survivor can be deleted.
    await prisma.job.updateMany({
      where: { companySlug: { in: [COMPANY_SLUG, OTHER_COMPANY_SLUG] } },
      data: { mergedIntoJobId: null },
    });
    await prisma.job.deleteMany({
      where: { companySlug: { in: [COMPANY_SLUG, OTHER_COMPANY_SLUG] } },
    });
  }

  async function countJobs(slug: string = COMPANY_SLUG): Promise<number> {
    return prisma.job.count({ where: { companySlug: slug } });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, DeduplicationModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    clock = new Date('2026-08-22T09:00:00.000Z');
    canonical = new CanonicalJobService(
      prisma,
      () => clock,
      new FuzzyMatchService(prisma),
      new CanonicalValuesService(prisma),
    );

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
    expect(app.get(FuzzyMatchService)).toBeInstanceOf(FuzzyMatchService);
  });

  describe('the same vacancy listed with a different country', () => {
    it('joins the existing job, because tier 3 never reads the country', async () => {
      // The case M6.2 left to this tier: `parseLocation` refuses to infer a country
      // from a city, so one board writing "Berlin" and another "Berlin, Germany"
      // hash differently with byte-identical titles.
      const withCountry = await ingest(posting());

      clock = new Date('2026-08-22T10:00:00.000Z');
      const withoutCountry = await ingest(
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}002`,
          url: 'https://fixtures.juniorjob.local/jobs/t3-002',
          location: 'Berlin',
          countryCode: null,
          description: BACKEND_AD_REPOSTED,
        }),
      );

      expect(withCountry.outcome).toBe('CREATED');
      expect(withoutCountry.outcome).toBe('FUZZY_MATCHED');
      expect(withoutCountry.jobId).toBe(withCountry.jobId);
      expect(await countJobs()).toBe(1);

      const job = await prisma.job.findUniqueOrThrow({
        where: { id: withCountry.jobId },
        select: {
          title: true,
          countryCode: true,
          dedupHash: true,
          lastSeenAt: true,
          postings: { select: { id: true } },
        },
      });
      expect(job.postings).toHaveLength(2);
      // Tier 3 does not rewrite canonical values (M7.4 chooses them) and does not
      // memoize: the job keeps the hash it was created with, so the next posting
      // spelled this way comes back through tier 3 rather than through tier 2.
      expect(job.title).toBe('Backend Developer (m/w/d)');
      expect(job.countryCode).toBe('DE');
      expect(job.dedupHash).toBe(withCountry.dedupHash);
      expect(job.dedupHash).not.toBe(withoutCountry.dedupHash);
      // The staleness sweep (M5.6) retires by `lastSeenAt`; this job was seen.
      expect(job.lastSeenAt).toEqual(new Date('2026-08-22T10:00:00.000Z'));
    });
  });

  describe('a title spelled differently by two boards', () => {
    it('merges "Front End Developer" into "Frontend Developer"', async () => {
      const first = await ingest(
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}fe1`,
          title: 'Frontend Developer',
        }),
      );
      const second = await ingest(
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}fe2`,
          url: 'https://fixtures.juniorjob.local/jobs/t3-fe2',
          title: 'Front End Developer (m/w/d)',
          description: BACKEND_AD_REPOSTED,
        }),
      );

      // Two spellings of one word, so the titles are not equal and tier 2 misses.
      expect(toNormalizedTitle('Front End Developer (m/w/d)')).toBe(
        'front end developer',
      );
      expect(second.outcome).toBe('FUZZY_MATCHED');
      expect(second.jobId).toBe(first.jobId);
      expect(await countJobs()).toBe(1);
    });
  });

  describe('two genuinely different roles at one company', () => {
    it('keeps them apart when the titles are not similar enough', async () => {
      const backend = await ingest(posting());
      const data = await ingest(
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}de1`,
          url: 'https://fixtures.juniorjob.local/jobs/t3-de1',
          title: 'Data Engineer',
          description: DATA_AD,
        }),
      );

      expect(data.outcome).toBe('CREATED');
      expect(data.jobId).not.toBe(backend.jobId);
      expect(await countJobs()).toBe(2);
    });

    it('keeps them apart when the titles match but the descriptions do not', async () => {
      // The gate that matters. These two clear the trigram threshold outright —
      // identical normalized titles, split only by country — so it is the
      // description check alone that stops them becoming one vacancy.
      const berlin = await ingest(posting());
      const dublin = await ingest(
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}ie1`,
          url: 'https://fixtures.juniorjob.local/jobs/t3-ie1',
          location: 'Dublin, Ireland',
          countryCode: 'IE',
          description: DATA_AD,
        }),
      );

      expect(dublin.outcome).toBe('CREATED');
      expect(dublin.jobId).not.toBe(berlin.jobId);
      expect(await countJobs()).toBe(2);
    });

    it('refuses to confirm on a description too thin to carry evidence', async () => {
      const thin = 'Apply now.';
      const first = await ingest(
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}th1`,
          description: thin,
        }),
      );
      const second = await ingest(
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}th2`,
          url: 'https://fixtures.juniorjob.local/jobs/t3-th2',
          countryCode: null,
          description: thin,
        }),
      );

      // Identical titles, identical text — and still a split, because two lines
      // confirm nothing. Absence of evidence is not evidence of a match.
      expect(second.outcome).toBe('CREATED');
      expect(second.jobId).not.toBe(first.jobId);
      expect(await countJobs()).toBe(2);
    });
  });

  describe('the companySlug scope', () => {
    it('never matches a job at another company', async () => {
      const other = await ingest(
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}oc1`,
          companyName: 'Tier3 Other Company GmbH',
          companySlug: OTHER_COMPANY_SLUG,
        }),
      );

      // Byte-identical title and description at a different company. The trigram
      // pass is scoped to one `companySlug`, so this can only be a new job.
      const mine = await ingest(
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}oc2`,
          url: 'https://fixtures.juniorjob.local/jobs/t3-oc2',
          countryCode: null,
        }),
      );

      expect(mine.outcome).toBe('CREATED');
      expect(mine.jobId).not.toBe(other.jobId);
      expect(await countJobs(OTHER_COMPANY_SLUG)).toBe(1);
      expect(await countJobs()).toBe(1);
    });
  });

  describe('a fuzzy candidate that was merged away', () => {
    it('takes the posting to the survivor, not the tombstone', async () => {
      const tombstone = await ingest(posting());
      const survivor = await prisma.job.create({
        data: {
          dedupHash: `t3-survivor-${Date.now()}`,
          title: 'Backend Developer',
          normalizedTitle: toNormalizedTitle('Backend Developer'),
          companyName: 'Tier3 Nordwind Software GmbH',
          companySlug: COMPANY_SLUG,
          countryCode: 'DE',
          language: 'en',
          description: 'The richer listing of the same vacancy.',
          technologies: [],
          effectivePostedAt: new Date('2026-08-20T09:00:00.000Z'),
        },
        select: { id: true },
      });
      await prisma.job.update({
        where: { id: tombstone.jobId },
        data: { mergedIntoJobId: survivor.id },
      });

      const next = await ingest(
        posting({
          externalId: `${EXTERNAL_ID_PREFIX}mg1`,
          url: 'https://fixtures.juniorjob.local/jobs/t3-mg1',
          countryCode: null,
          description: BACKEND_AD_REPOSTED,
        }),
      );

      // A tombstone stays a candidate — it is evidence about the same vacancy, and
      // tier 2 redirects the same way — but search excludes a merged row (D2), so
      // the posting has to land on the survivor.
      expect(next.outcome).toBe('FUZZY_MATCHED');
      expect(next.jobId).toBe(survivor.id);
    });
  });
});
