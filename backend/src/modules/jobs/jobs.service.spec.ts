import { JobsService, LISTABLE_JOBS_WHERE } from './jobs.service';
import { PrismaService } from '../../common/prisma/prisma.service';

interface PrismaMock {
  job: {
    findMany: jest.Mock;
    count: jest.Mock;
    findUnique: jest.Mock;
  };
  $transaction: jest.Mock;
}

function summaryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    title: 'Junior Backend Developer',
    companyName: 'Aurelia Systems Ltd',
    location: 'Dublin',
    countryCode: 'IE',
    workplaceType: 'HYBRID',
    employmentType: 'FULL_TIME',
    language: 'en',
    technologies: ['java'],
    postedAt: new Date('2026-08-19T00:00:00.000Z'),
    effectivePostedAt: new Date('2026-08-19T00:00:00.000Z'),
    juniorLevel: 'ENTRY_LEVEL',
    juniorScore: 94,
    requiredMinYears: 0,
    requiredMaxYears: 1,
    postings: [{ sourceId: 'source-1' }],
    ...overrides,
  };
}

function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    ...summaryRow(),
    description: 'This is an entry level position.',
    isActive: true,
    classifiedAt: new Date('2026-08-20T00:00:00.000Z'),
    postings: [
      {
        url: 'https://fixtures.juniorjob.local/board/1001',
        source: {
          key: 'fixture-board',
          displayName: 'Fixture Job Board',
          attributionText: 'Synthetic development data.',
        },
      },
    ],
    classifications: [
      {
        classifierVersion: 'seed-fixture-1.0',
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
        createdAt: new Date('2026-08-20T00:00:00.000Z'),
      },
    ],
    ...overrides,
  };
}

describe('JobsService', () => {
  let service: JobsService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      job: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    service = new JobsService(prisma as unknown as PrismaService);
  });

  describe('list()', () => {
    it('excludes inactive and merged jobs, newest first, with a stable tiebreak', async () => {
      prisma.job.findMany.mockResolvedValue([]);
      prisma.job.count.mockResolvedValue(0);

      await service.list(1, 20);

      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true, mergedIntoJobId: null },
          orderBy: [{ effectivePostedAt: 'desc' }, { id: 'desc' }],
        }),
      );
      expect(LISTABLE_JOBS_WHERE).toEqual({
        isActive: true,
        mergedIntoJobId: null,
      });
    });

    it('counts the total under the same filter as the page', async () => {
      prisma.job.findMany.mockResolvedValue([]);
      prisma.job.count.mockResolvedValue(0);

      await service.list(1, 20);

      expect(prisma.job.count).toHaveBeenCalledWith({
        where: LISTABLE_JOBS_WHERE,
      });
      // Page and total must come from one snapshot, or they can disagree.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('translates page/pageSize into skip/take', async () => {
      prisma.job.findMany.mockResolvedValue([]);
      prisma.job.count.mockResolvedValue(0);

      await service.list(3, 20);

      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 40, take: 20 }),
      );
    });

    it('returns the { items, page, pageSize, total } envelope', async () => {
      prisma.job.findMany.mockResolvedValue([summaryRow()]);
      prisma.job.count.mockResolvedValue(137);

      const result = await service.list(2, 20);

      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(20);
      expect(result.total).toBe(137);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('job-1');
      expect(result.items[0].juniorScore).toBe(94);
    });

    it('counts distinct sources, not postings', async () => {
      prisma.job.findMany.mockResolvedValue([
        summaryRow({
          postings: [
            { sourceId: 'source-1' },
            { sourceId: 'source-2' },
            { sourceId: 'source-1' },
          ],
        }),
      ]);
      prisma.job.count.mockResolvedValue(1);

      const result = await service.list(1, 20);

      expect(result.items[0].sourceCount).toBe(2);
    });

    it('never leaks a Prisma field the summary DTO does not declare', async () => {
      prisma.job.findMany.mockResolvedValue([
        summaryRow({ dedupHash: 'should-not-surface' }),
      ]);
      prisma.job.count.mockResolvedValue(1);

      const result = await service.list(1, 20);

      expect(result.items[0]).not.toHaveProperty('dedupHash');
      expect(result.items[0]).not.toHaveProperty('postings');
    });
  });

  describe('findDetail()', () => {
    it('returns null for an unknown id', async () => {
      prisma.job.findUnique.mockResolvedValue(null);

      await expect(service.findDetail('missing')).resolves.toBeNull();
    });

    it('maps evidence and every source URL', async () => {
      prisma.job.findUnique
        .mockResolvedValueOnce({ id: 'job-1', mergedIntoJobId: null })
        .mockResolvedValueOnce(detailRow());

      const detail = await service.findDetail('job-1');

      expect(detail?.redirectedFromJobId).toBeNull();
      expect(detail?.classification?.level).toBe('ENTRY_LEVEL');
      expect(detail?.classification?.positiveSignals).toEqual([
        {
          code: 'ENTRY_LEVEL_STATED',
          weight: 30,
          evidence: 'This is an entry level position.',
        },
      ]);
      expect(detail?.sources).toEqual([
        {
          sourceKey: 'fixture-board',
          sourceName: 'Fixture Job Board',
          url: 'https://fixtures.juniorjob.local/board/1001',
          attributionText: 'Synthetic development data.',
        },
      ]);
    });

    it('drops a malformed signal instead of failing the whole detail', async () => {
      prisma.job.findUnique
        .mockResolvedValueOnce({ id: 'job-1', mergedIntoJobId: null })
        .mockResolvedValueOnce(
          detailRow({
            classifications: [
              {
                ...detailRow().classifications[0],
                positiveSignals: [
                  { code: 'OK', weight: 10, evidence: 'kept' },
                  { code: 'NO_WEIGHT', evidence: 'dropped' },
                  'not-an-object',
                ],
                negativeSignals: { not: 'an array' },
              },
            ],
          }),
        );

      const detail = await service.findDetail('job-1');

      expect(detail?.classification?.positiveSignals).toHaveLength(1);
      expect(detail?.classification?.positiveSignals[0].code).toBe('OK');
      expect(detail?.classification?.negativeSignals).toEqual([]);
    });

    it('returns a null classification when the job has never been classified', async () => {
      prisma.job.findUnique
        .mockResolvedValueOnce({ id: 'job-1', mergedIntoJobId: null })
        .mockResolvedValueOnce(detailRow({ classifications: [] }));

      const detail = await service.findDetail('job-1');

      expect(detail?.classification).toBeNull();
    });

    it('returns an inactive job — only lists exclude those', async () => {
      prisma.job.findUnique
        .mockResolvedValueOnce({ id: 'job-1', mergedIntoJobId: null })
        .mockResolvedValueOnce(detailRow({ isActive: false }));

      const detail = await service.findDetail('job-1');

      expect(detail?.isActive).toBe(false);
    });

    it('resolves a merged job to its canonical job and reports the requested id', async () => {
      prisma.job.findUnique
        .mockResolvedValueOnce({ id: 'merged-1', mergedIntoJobId: 'job-1' })
        .mockResolvedValueOnce({ id: 'job-1', mergedIntoJobId: null })
        .mockResolvedValueOnce(detailRow());

      const detail = await service.findDetail('merged-1');

      expect(detail?.id).toBe('job-1');
      expect(detail?.redirectedFromJobId).toBe('merged-1');
    });

    it('follows a chain of merges', async () => {
      prisma.job.findUnique
        .mockResolvedValueOnce({ id: 'merged-2', mergedIntoJobId: 'merged-1' })
        .mockResolvedValueOnce({ id: 'merged-1', mergedIntoJobId: 'job-1' })
        .mockResolvedValueOnce({ id: 'job-1', mergedIntoJobId: null })
        .mockResolvedValueOnce(detailRow());

      const detail = await service.findDetail('merged-2');

      expect(detail?.id).toBe('job-1');
      expect(detail?.redirectedFromJobId).toBe('merged-2');
    });

    it('returns null when the redirect target no longer exists', async () => {
      prisma.job.findUnique
        .mockResolvedValueOnce({ id: 'merged-1', mergedIntoJobId: 'gone' })
        .mockResolvedValueOnce(null);

      await expect(service.findDetail('merged-1')).resolves.toBeNull();
    });

    it('gives up on a merge cycle rather than looping or serving a tombstone', async () => {
      prisma.job.findUnique.mockImplementation(
        ({ where }: { where: { id: string } }) =>
          Promise.resolve(
            where.id === 'job-a'
              ? { id: 'job-a', mergedIntoJobId: 'job-b' }
              : { id: 'job-b', mergedIntoJobId: 'job-a' },
          ),
      );

      await expect(service.findDetail('job-a')).resolves.toBeNull();
    });
  });
});
