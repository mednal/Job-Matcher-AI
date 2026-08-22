import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CanonicalJobService } from './canonical-job.service';
import { dedupHash } from './dedup-hash';
import { toNormalizedTitle } from './normalized-title';
import type { NormalizedPosting } from './posting-identity.service';

const NOW = new Date('2026-08-22T12:00:00.000Z');

interface PrismaMock {
  job: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  jobPosting: {
    update: jest.Mock;
  };
}

function normalized(
  overrides: Partial<NormalizedPosting> = {},
): NormalizedPosting {
  return {
    sourceId: 'source-1',
    externalId: 'fx-001',
    url: 'https://fixtures.juniorjob.local/jobs/fx-001',
    title: 'Junior Backend Developer (m/w/d)',
    companyName: 'Nordwind Software GmbH',
    companySlug: 'nordwind-software',
    location: 'Berlin, Germany',
    countryCode: 'DE',
    workplaceType: 'HYBRID',
    employmentType: 'FULL_TIME',
    language: 'de',
    description: 'Entry level position. Training provided.',
    technologies: ['java', 'spring-boot'],
    postedAt: new Date('2026-08-20T09:00:00.000Z'),
    ...overrides,
  };
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('CanonicalJobService', () => {
  let prisma: PrismaMock;
  let service: CanonicalJobService;

  /** jest types `mock.calls` as `any[][]`; narrow once, here. */
  const callArgs = (mock: jest.Mock, index = 0): Record<string, any> =>
    (mock.mock.calls as unknown as unknown[][])[index][0] as Record<
      string,
      any
    >;

  /** `job.findUnique` answers redirect walks and hash lookups from one table. */
  const jobRows = (rows: Record<string, unknown>[]): void => {
    prisma.job.findUnique.mockImplementation(
      ({ where }: { where: { id?: string; dedupHash?: string } }) =>
        rows.find(
          (row) =>
            (where.id !== undefined && row.id === where.id) ||
            (where.dedupHash !== undefined &&
              row.dedupHash === where.dedupHash),
        ) ?? null,
    );
  };

  beforeEach(() => {
    prisma = {
      job: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'job-new' }),
        update: jest.fn().mockResolvedValue({ id: 'job-new' }),
      },
      jobPosting: { update: jest.fn().mockResolvedValue({}) },
    };
    service = new CanonicalJobService(
      prisma as unknown as PrismaService,
      () => NOW,
    );
  });

  describe('when no job carries the hash', () => {
    it('opens one and attaches the posting to it', async () => {
      const posting = normalized();

      const result = await service.assign(posting, {
        postingId: 'posting-1',
        jobId: null,
      });

      expect(result.outcome).toBe('CREATED');
      expect(result.jobId).toBe('job-new');
      expect(result.normalizedTitle).toBe('backend developer');
      expect(result.dedupHash).toBe(
        dedupHash({
          companySlug: 'nordwind-software',
          normalizedTitle: 'backend developer',
          countryCode: 'DE',
        }),
      );

      const data = callArgs(prisma.job.create).data as Record<string, unknown>;
      expect(data.dedupHash).toBe(result.dedupHash);
      expect(data.normalizedTitle).toBe('backend developer');
      // The display title keeps everything the source wrote; only the dedup form
      // is stripped.
      expect(data.title).toBe('Junior Backend Developer (m/w/d)');
      // One statement, so a job can never exist without the posting that opened it.
      expect(data.postings).toEqual({ connect: { id: 'posting-1' } });
      expect(prisma.jobPosting.update).not.toHaveBeenCalled();
    });

    it('leaves the classification block empty for Phase 8', async () => {
      await service.assign(normalized(), {
        postingId: 'posting-1',
        jobId: null,
      });

      const data = callArgs(prisma.job.create).data as Record<string, unknown>;
      for (const column of [
        'juniorLevel',
        'juniorScore',
        'requiredMinYears',
        'requiredMaxYears',
        'classifiedAt',
      ]) {
        expect(data[column]).toBeUndefined();
      }
    });

    it('falls back to firstSeenAt when the source published no date', async () => {
      await service.assign(normalized({ postedAt: null }), {
        postingId: 'posting-1',
        jobId: null,
      });

      const data = callArgs(prisma.job.create).data as Record<string, unknown>;
      expect(data.postedAt).toBeNull();
      // Non-null by design: sorting and pagination need a date on every row.
      expect(data.effectivePostedAt).toEqual(NOW);
    });

    it('takes effectivePostedAt from postedAt when there is one', async () => {
      await service.assign(normalized(), {
        postingId: 'posting-1',
        jobId: null,
      });

      const data = callArgs(prisma.job.create).data as Record<string, unknown>;
      expect(data.effectivePostedAt).toEqual(
        new Date('2026-08-20T09:00:00.000Z'),
      );
    });
  });

  describe('when a job already carries the hash', () => {
    it('attaches the posting to it instead of creating a second one', async () => {
      const posting = normalized();
      const hash = dedupHash({
        companySlug: posting.companySlug,
        normalizedTitle: toNormalizedTitle(posting.title),
        countryCode: posting.countryCode,
      });
      jobRows([{ id: 'job-1', dedupHash: hash, mergedIntoJobId: null }]);

      const result = await service.assign(posting, {
        postingId: 'posting-2',
        jobId: null,
      });

      expect(result).toMatchObject({ outcome: 'MATCHED', jobId: 'job-1' });
      expect(prisma.job.create).not.toHaveBeenCalled();
      expect(callArgs(prisma.jobPosting.update)).toMatchObject({
        where: { id: 'posting-2' },
        data: { jobId: 'job-1' },
      });
    });

    it('never rewrites the matched job canonical values', async () => {
      const posting = normalized({ description: 'A much richer description.' });
      const hash = dedupHash({
        companySlug: posting.companySlug,
        normalizedTitle: toNormalizedTitle(posting.title),
        countryCode: posting.countryCode,
      });
      jobRows([{ id: 'job-1', dedupHash: hash, mergedIntoJobId: null }]);

      await service.assign(posting, { postingId: 'posting-2', jobId: null });

      // Choosing canonical values from the richest posting is M7.4. Writing them
      // here would let the last posting of a run silently win.
      expect(callArgs(prisma.job.update).data).toEqual({
        lastSeenAt: NOW,
        isActive: true,
      });
    });

    it('follows a merge redirect to the surviving job', async () => {
      const posting = normalized();
      const hash = dedupHash({
        companySlug: posting.companySlug,
        normalizedTitle: toNormalizedTitle(posting.title),
        countryCode: posting.countryCode,
      });
      jobRows([
        { id: 'job-old', dedupHash: hash, mergedIntoJobId: 'job-mid' },
        { id: 'job-mid', dedupHash: 'other', mergedIntoJobId: 'job-live' },
        { id: 'job-live', dedupHash: 'live', mergedIntoJobId: null },
      ]);

      const result = await service.assign(posting, {
        postingId: 'posting-2',
        jobId: null,
      });

      // A posting must join the survivor, never the tombstone: search excludes a
      // merged row, so attaching there would hide the vacancy (D2).
      expect(result.jobId).toBe('job-live');
      expect(callArgs(prisma.jobPosting.update).data).toEqual({
        jobId: 'job-live',
      });
    });

    it('stops on a merge cycle instead of looping', async () => {
      const posting = normalized();
      const hash = dedupHash({
        companySlug: posting.companySlug,
        normalizedTitle: toNormalizedTitle(posting.title),
        countryCode: posting.countryCode,
      });
      jobRows([
        { id: 'job-a', dedupHash: hash, mergedIntoJobId: 'job-b' },
        { id: 'job-b', dedupHash: 'b', mergedIntoJobId: 'job-a' },
      ]);

      const result = await service.assign(posting, {
        postingId: 'posting-2',
        jobId: null,
      });

      // Unlike the read side, ingestion holds a posting and must put it somewhere,
      // so it stops at the last readable row and logs rather than failing the item.
      expect(result.jobId).toBe('job-a');
    });
  });

  describe('a UNIQUE violation on dedupHash', () => {
    it('is retried as a match against the winner, not raised', async () => {
      const posting = normalized();
      const hash = dedupHash({
        companySlug: posting.companySlug,
        normalizedTitle: toNormalizedTitle(posting.title),
        countryCode: posting.countryCode,
      });

      // The lookup misses, then a concurrent run inserts, then our insert loses.
      let inserted = false;
      prisma.job.findUnique.mockImplementation(
        ({ where }: { where: { dedupHash?: string; id?: string } }) => {
          if (where.id === 'job-winner') {
            return { id: 'job-winner', mergedIntoJobId: null };
          }
          if (where.dedupHash === hash && inserted) {
            return { id: 'job-winner' };
          }
          return null;
        },
      );
      prisma.job.create.mockImplementation(() => {
        inserted = true;
        throw uniqueViolation();
      });

      const result = await service.assign(posting, {
        postingId: 'posting-2',
        jobId: null,
      });

      // D1: the constraint is the guarantee that two canonical jobs cannot exist
      // for one vacancy, so losing the race is the constraint working.
      expect(result).toMatchObject({ outcome: 'MATCHED', jobId: 'job-winner' });
      expect(callArgs(prisma.jobPosting.update).data).toEqual({
        jobId: 'job-winner',
      });
    });

    it('throws when the winner cannot be read back', async () => {
      prisma.job.create.mockRejectedValue(uniqueViolation());

      await expect(
        service.assign(normalized(), { postingId: 'posting-2', jobId: null }),
      ).rejects.toThrow(/could not be read back/);
    });

    it('does not swallow any other Prisma error', async () => {
      prisma.job.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Foreign key failed', {
          code: 'P2003',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.assign(normalized(), { postingId: 'posting-2', jobId: null }),
      ).rejects.toThrow('Foreign key failed');
    });
  });

  describe('a posting that is already clustered', () => {
    it('keeps its cluster even when the title now hashes differently', async () => {
      jobRows([{ id: 'job-1', dedupHash: 'stale', mergedIntoJobId: null }]);

      const result = await service.assign(
        normalized({ title: 'Completely Different Role' }),
        { postingId: 'posting-1', jobId: 'job-1' },
      );

      // Same rule tier 1 states: re-ingestion must never silently undo clustering,
      // and tier 3's split bias makes a merge expensive to redo.
      expect(result).toMatchObject({
        outcome: 'ALREADY_CLUSTERED',
        jobId: 'job-1',
      });
      expect(prisma.job.create).not.toHaveBeenCalled();
      expect(prisma.jobPosting.update).not.toHaveBeenCalled();
    });

    it('still stamps the job as seen', async () => {
      jobRows([{ id: 'job-1', dedupHash: 'stale', mergedIntoJobId: null }]);

      await service.assign(normalized(), {
        postingId: 'posting-1',
        jobId: 'job-1',
      });

      // The M5.6 staleness sweep retires a job by `lastSeenAt`; a job with a
      // posting in this run has been seen, whether or not its text moved.
      expect(callArgs(prisma.job.update)).toMatchObject({
        where: { id: 'job-1' },
        data: { lastSeenAt: NOW, isActive: true },
      });
    });
  });

  describe('a title that normalizes to nothing', () => {
    it('fails the item instead of hashing an empty title', async () => {
      // Tier 1 rejects a blank title, but punctuation survives it. Hashing "" would
      // cluster every such posting at one company into a single job.
      await expect(
        service.assign(normalized({ title: '---' }), {
          postingId: 'posting-1',
          jobId: null,
        }),
      ).rejects.toThrow(/no usable title/);
      expect(prisma.job.create).not.toHaveBeenCalled();
    });
  });
});
