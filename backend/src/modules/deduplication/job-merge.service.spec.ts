import { PrismaService } from '../../common/prisma/prisma.service';
import type { CanonicalValuesService } from './canonical-values.service';
import { JobMergeService } from './job-merge.service';

interface PrismaMock {
  job: {
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  jobPosting: {
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
}

describe('JobMergeService', () => {
  let prisma: PrismaMock;
  let canonicalValues: { refresh: jest.Mock };
  let service: JobMergeService;

  /** `job.findUnique` answers both the existence checks and the redirect walks. */
  const jobRows = (rows: Record<string, unknown>[]): void => {
    prisma.job.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(rows.find((row) => row.id === where.id) ?? null),
    );
  };

  const updateManyArgs = (mock: jest.Mock, index = 0): Record<string, any> =>
    (mock.mock.calls as unknown as unknown[][])[index][0] as Record<
      string,
      any
    >;

  beforeEach(() => {
    prisma = {
      job: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'job-winner' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      jobPosting: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      // The real client hands the callback a transaction client; every table used
      // inside the transaction is on this mock, so handing back the mock itself is
      // an accurate stand-in.
      $transaction: jest.fn((run: (tx: unknown) => unknown) => run(prisma)),
    };
    canonicalValues = { refresh: jest.fn().mockResolvedValue(undefined) };
    service = new JobMergeService(
      prisma as unknown as PrismaService,
      canonicalValues as unknown as CanonicalValuesService,
    );
  });

  describe('merging one job into another', () => {
    beforeEach(() => {
      jobRows([
        { id: 'job-loser', mergedIntoJobId: null },
        { id: 'job-winner', mergedIntoJobId: null },
      ]);
    });

    it('moves the postings and redirects the loser without deleting it', async () => {
      const result = await service.merge('job-loser', 'job-winner');

      expect(result).toMatchObject({
        outcome: 'MERGED',
        winnerId: 'job-winner',
        loserId: 'job-loser',
        movedPostings: 2,
      });
      expect(updateManyArgs(prisma.jobPosting.updateMany)).toEqual({
        where: { jobId: 'job-loser' },
        data: { jobId: 'job-winner' },
      });
      // D2: the row is retained and gains a redirect, so search skips it while a
      // `SavedJob` pointing at it still resolves.
      expect(
        (prisma.job.update.mock.calls as unknown as unknown[][])[0][0],
      ).toEqual({
        where: { id: 'job-loser' },
        data: { mergedIntoJobId: 'job-winner' },
      });
    });

    it('re-derives the winner canonical values, since it just gained postings', async () => {
      await service.merge('job-loser', 'job-winner');

      expect(canonicalValues.refresh).toHaveBeenCalledWith('job-winner');
    });

    it('does the writes in one transaction', async () => {
      await service.merge('job-loser', 'job-winner');

      // A half-applied merge would leave postings on a row that search excludes —
      // the vacancy would vanish from the product entirely.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('leaves the loser dedupHash and classifications alone', async () => {
      await service.merge('job-loser', 'job-winner');

      // The hash still routes tier 2 to the tombstone, which is what makes future
      // postings of the losing spelling follow the redirect onto the winner.
      const data = (
        (prisma.job.update.mock.calls as unknown as unknown[][])[0][0] as {
          data: Record<string, unknown>;
        }
      ).data;
      expect(Object.keys(data)).toEqual(['mergedIntoJobId']);
    });
  });

  describe('when a job in the merge was itself merged away', () => {
    it('lands on the survivor instead of extending the chain', async () => {
      jobRows([
        { id: 'job-loser', mergedIntoJobId: null },
        { id: 'job-old', mergedIntoJobId: 'job-live' },
        { id: 'job-live', mergedIntoJobId: null },
      ]);

      const result = await service.merge('job-loser', 'job-old');

      expect(result.winnerId).toBe('job-live');
      expect(updateManyArgs(prisma.jobPosting.updateMany).data).toEqual({
        jobId: 'job-live',
      });
    });

    it('re-points tombstones that pointed at the loser', async () => {
      jobRows([
        { id: 'job-loser', mergedIntoJobId: null },
        { id: 'job-winner', mergedIntoJobId: null },
      ]);
      prisma.job.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.merge('job-loser', 'job-winner');

      // Left alone they would chain through the loser, and every later merge would
      // add a hop until `MAX_MERGE_HOPS` cut the walk short.
      expect(updateManyArgs(prisma.job.updateMany)).toEqual({
        where: { mergedIntoJobId: 'job-loser' },
        data: { mergedIntoJobId: 'job-winner' },
      });
      expect(result.repointedRedirects).toBe(3);
    });
  });

  describe('when both ids already resolve to the same job', () => {
    it('is a no-op rather than a self-redirect', async () => {
      jobRows([
        { id: 'job-old', mergedIntoJobId: 'job-live' },
        { id: 'job-live', mergedIntoJobId: null },
      ]);

      const result = await service.merge('job-old', 'job-live');

      // Makes a re-run after a partial failure safe, and a job can never be
      // redirected to itself — which would hide it from search permanently.
      expect(result).toMatchObject({
        outcome: 'ALREADY_MERGED',
        winnerId: 'job-live',
        movedPostings: 0,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.job.update).not.toHaveBeenCalled();
    });

    it('is a no-op when a job is merged into itself', async () => {
      jobRows([{ id: 'job-1', mergedIntoJobId: null }]);

      const result = await service.merge('job-1', 'job-1');

      expect(result.outcome).toBe('ALREADY_MERGED');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('when an id does not exist', () => {
    it('throws instead of silently doing nothing', async () => {
      jobRows([{ id: 'job-winner', mergedIntoJobId: null }]);

      // A merge names two specific vacancies. Reporting success on a typo would
      // leave the split in place with nobody looking at it again.
      await expect(service.merge('job-typo', 'job-winner')).rejects.toThrow(
        /job-typo does not exist/,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('checks the winner too', async () => {
      jobRows([{ id: 'job-loser', mergedIntoJobId: null }]);

      await expect(service.merge('job-loser', 'job-typo')).rejects.toThrow(
        /job-typo does not exist/,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
