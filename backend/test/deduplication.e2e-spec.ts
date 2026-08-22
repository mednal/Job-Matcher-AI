import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Logger } from '@nestjs/common';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DeduplicationModule } from '../src/modules/deduplication/deduplication.module';
import {
  PostingIdentityService,
  type NormalizedPosting,
  type PostingUpsertResult,
} from '../src/modules/deduplication/posting-identity.service';
import { SourceRegistryService } from '../src/modules/sources/source-registry.service';
import type { RawJob } from '../src/modules/sources/source-adapter.types';
import { FIXTURE_SOURCE_KEY } from '../src/modules/sources/adapters/fixture/fixture-source.adapter';

/**
 * M7.1's Verify line, against a real database: two runs over identical fixtures
 * leave one posting.
 *
 * The fixture *adapter* supplies the payloads, so the identities under test are the
 * ones a real run would produce rather than literals invented here. Mapping payload
 * to `NormalizedPosting` is done in this file with a deliberately dumb helper: the
 * real mapping is the M6 normalization stage driven by the M5.4 orchestrator, and
 * neither exists yet. What is under test is tier 1 — identity, not normalization.
 *
 * The seeded postings of `fixture-board` use `fb-` external ids and the adapter
 * yields `fx-` ones, so cleanup is scoped to the latter and leaves the seed intact.
 */
describe('Deduplication tier 1 — source identity (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let registry: SourceRegistryService;
  let sourceId: string;
  let rawJobs: RawJob[];

  /** Advanced by hand, so `lastSeenAt` movement is assertable rather than timed. */
  let clock: Date;
  let identity: PostingIdentityService;

  const ADAPTER_ID_PREFIX = 'fx-';

  async function wipeAdapterPostings(): Promise<void> {
    if (!sourceId) {
      return;
    }
    await prisma.jobPosting.deleteMany({
      where: { sourceId, externalId: { startsWith: ADAPTER_ID_PREFIX } },
    });
  }

  async function countAdapterPostings(): Promise<number> {
    return prisma.jobPosting.count({
      where: { sourceId, externalId: { startsWith: ADAPTER_ID_PREFIX } },
    });
  }

  /** Payload field -> column, with no interpretation. Not the M6 stage. */
  function toNormalizedPosting(
    raw: RawJob,
    overrides: Partial<NormalizedPosting> = {},
  ): NormalizedPosting {
    const payload = raw.payload as Record<string, string | undefined>;
    const company = payload.company ?? 'Unknown';
    return {
      sourceId,
      externalId: raw.externalId,
      url: raw.url,
      title: payload.title ?? 'Untitled',
      companyName: company,
      companySlug: company.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      location: payload.location ?? null,
      countryCode: null,
      workplaceType: null,
      employmentType: null,
      language: 'en',
      description: payload.description ?? '',
      technologies: [],
      postedAt: raw.postedAt ?? null,
      ...overrides,
    };
  }

  /** One "run": every posting the adapter yielded, upserted in order. */
  async function ingestAll(
    overridesFor: (raw: RawJob) => Partial<NormalizedPosting> = () => ({}),
  ): Promise<PostingUpsertResult[]> {
    const results: PostingUpsertResult[] = [];
    for (const raw of rawJobs) {
      results.push(
        await identity.upsert(toNormalizedPosting(raw, overridesFor(raw))),
      );
    }
    return results;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, DeduplicationModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    registry = app.get(SourceRegistryService);

    // The service resolves through DI — asserted below — but the instance the tests
    // drive is constructed with a controllable clock, so `firstSeenAt` and
    // `lastSeenAt` can be compared without sleeping between runs.
    clock = new Date('2026-08-22T09:00:00.000Z');
    identity = new PostingIdentityService(prisma, () => clock);

    const adapter = registry.require(FIXTURE_SOURCE_KEY);
    const source = await prisma.jobSource.upsert({
      where: { key: FIXTURE_SOURCE_KEY },
      create: {
        key: adapter.descriptor.key,
        displayName: adapter.descriptor.displayName,
        accessMethod: adapter.descriptor.accessMethod,
        termsUrl: adapter.descriptor.termsUrl,
        attributionText: adapter.descriptor.attributionText ?? null,
      },
      update: {},
      select: { id: true },
    });
    sourceId = source.id;

    rawJobs = [];
    const stream = adapter.fetchJobs(
      { limit: 50 },
      {
        runId: 'dedup-e2e',
        signal: new AbortController().signal,
        logger: new Logger('dedup-e2e'),
      },
    );
    for await (const raw of stream) {
      rawJobs.push(raw);
    }

    await wipeAdapterPostings();
  });

  afterAll(async () => {
    await wipeAdapterPostings();
    await app.close();
  });

  beforeEach(async () => {
    await wipeAdapterPostings();
    clock = new Date('2026-08-22T09:00:00.000Z');
  });

  it('resolves through the module graph', () => {
    expect(app.get(PostingIdentityService)).toBeInstanceOf(
      PostingIdentityService,
    );
    expect(rawJobs.length).toBeGreaterThan(0);
  });

  describe('two runs over identical fixtures', () => {
    it('leave one posting per external id', async () => {
      const first = await ingestAll();
      expect(first.every((r) => r.outcome === 'CREATED')).toBe(true);
      expect(await countAdapterPostings()).toBe(rawJobs.length);

      clock = new Date('2026-08-22T10:00:00.000Z');
      const second = await ingestAll();

      expect(second.every((r) => r.outcome === 'UNCHANGED')).toBe(true);
      expect(await countAdapterPostings()).toBe(rawJobs.length);
      expect(second.map((r) => r.postingId)).toEqual(
        first.map((r) => r.postingId),
      );
    });

    it('keep firstSeenAt and move lastSeenAt', async () => {
      await ingestAll();
      clock = new Date('2026-08-22T10:00:00.000Z');
      await ingestAll();

      const row = await prisma.jobPosting.findUniqueOrThrow({
        where: {
          sourceId_externalId: {
            sourceId,
            externalId: rawJobs[0].externalId,
          },
        },
        select: { firstSeenAt: true, lastSeenAt: true },
      });

      expect(row.firstSeenAt).toEqual(new Date('2026-08-22T09:00:00.000Z'));
      expect(row.lastSeenAt).toEqual(new Date('2026-08-22T10:00:00.000Z'));
    });
  });

  describe('a posting the source edited', () => {
    it('is updated in place, not duplicated', async () => {
      const [created] = await ingestAll();

      clock = new Date('2026-08-22T10:00:00.000Z');
      const edited = await ingestAll((raw) =>
        raw.externalId === rawJobs[0].externalId
          ? { description: 'Now requires 5 years of professional experience.' }
          : {},
      );

      expect(edited[0].outcome).toBe('UPDATED');
      expect(edited[0].postingId).toBe(created.postingId);
      expect(edited.slice(1).every((r) => r.outcome === 'UNCHANGED')).toBe(
        true,
      );
      expect(await countAdapterPostings()).toBe(rawJobs.length);

      const row = await prisma.jobPosting.findUniqueOrThrow({
        where: { id: created.postingId },
        select: { description: true, contentHash: true },
      });
      expect(row.description).toBe(
        'Now requires 5 years of professional experience.',
      );
      expect(row.contentHash).toBe(edited[0].contentHash);
    });
  });

  describe('cluster membership', () => {
    it('survives re-ingestion — tier 1 never reassigns jobId', async () => {
      const [created] = await ingestAll();

      // Stand in for what M7.2/M7.3 will do: attach the posting to a canonical job.
      const job = await prisma.job.findFirstOrThrow({ select: { id: true } });
      await prisma.jobPosting.update({
        where: { id: created.postingId },
        data: { jobId: job.id },
      });

      clock = new Date('2026-08-22T10:00:00.000Z');
      const [again] = await ingestAll((raw) =>
        raw.externalId === rawJobs[0].externalId
          ? { title: 'A different title entirely' }
          : {},
      );

      expect(again.outcome).toBe('UPDATED');
      expect(again.jobId).toBe(job.id);

      // Leave the seeded job's posting count as it was found.
      await prisma.jobPosting.update({
        where: { id: created.postingId },
        data: { jobId: null },
      });
    });
  });

  describe('a posting a staleness sweep had retired', () => {
    it('is reactivated when the source lists it again', async () => {
      const [created] = await ingestAll();
      await prisma.jobPosting.update({
        where: { id: created.postingId },
        data: { isActive: false },
      });

      clock = new Date('2026-08-22T10:00:00.000Z');
      const [again] = await ingestAll();

      // Identical content, so only the reactivation makes this an update.
      expect(again.outcome).toBe('UPDATED');
      const row = await prisma.jobPosting.findUniqueOrThrow({
        where: { id: created.postingId },
        select: { isActive: true },
      });
      expect(row.isActive).toBe(true);
    });
  });

  describe('the unique constraint tier 1 depends on', () => {
    it('rejects a second row for the same (sourceId, externalId)', async () => {
      const [created] = await ingestAll();
      const row = await prisma.jobPosting.findUniqueOrThrow({
        where: { id: created.postingId },
      });

      await expect(
        prisma.jobPosting.create({
          data: {
            sourceId: row.sourceId,
            externalId: row.externalId,
            url: row.url,
            title: row.title,
            companyName: row.companyName,
            companySlug: row.companySlug,
            description: row.description,
            contentHash: 'a-different-hash',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });
});
