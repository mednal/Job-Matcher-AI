import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  PostingIdentityService,
  type NormalizedPosting,
} from './posting-identity.service';
import { postingContentHash } from './posting-content-hash';

const NOW = new Date('2026-08-22T12:00:00.000Z');

interface PrismaMock {
  jobPosting: {
    findUnique: jest.Mock;
    create: jest.Mock;
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
    title: 'Junior Backend Developer (m/f/d)',
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

describe('PostingIdentityService', () => {
  let prisma: PrismaMock;
  let service: PostingIdentityService;

  /** jest types `mock.calls` as `any[][]`; narrow once, here. */
  const callArgs = (mock: jest.Mock, index = 0): Record<string, any> =>
    (mock.mock.calls as unknown as unknown[][])[index][0] as Record<
      string,
      any
    >;

  beforeEach(() => {
    prisma = {
      jobPosting: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new PostingIdentityService(
      prisma as unknown as PrismaService,
      () => NOW,
    );
  });

  describe('a posting this source has never sent', () => {
    beforeEach(() => {
      prisma.jobPosting.findUnique.mockResolvedValue(null);
      prisma.jobPosting.create.mockResolvedValue({
        id: 'posting-1',
        jobId: null,
      });
    });

    it('inserts it and reports CREATED', async () => {
      const result = await service.upsert(normalized());

      expect(result).toEqual({
        postingId: 'posting-1',
        outcome: 'CREATED',
        jobId: null,
        contentHash: postingContentHash(normalized()),
      });
      expect(prisma.jobPosting.update).not.toHaveBeenCalled();
    });

    it('matches on the (sourceId, externalId) pair, not on content', async () => {
      await service.upsert(normalized());

      expect(callArgs(prisma.jobPosting.findUnique).where).toEqual({
        sourceId_externalId: { sourceId: 'source-1', externalId: 'fx-001' },
      });
    });

    it('stamps firstSeenAt and lastSeenAt from one clock reading', async () => {
      await service.upsert(normalized());

      const data = callArgs(prisma.jobPosting.create).data as {
        firstSeenAt: Date;
        lastSeenAt: Date;
        isActive: boolean;
      };
      expect(data.firstSeenAt).toEqual(NOW);
      expect(data.lastSeenAt).toEqual(NOW);
      expect(data.isActive).toBe(true);
    });

    it('never assigns jobId — that belongs to tiers 2 and 3', async () => {
      await service.upsert(normalized());

      expect(callArgs(prisma.jobPosting.create).data).not.toHaveProperty(
        'jobId',
      );
    });
  });

  describe('a posting that already exists', () => {
    function existing(overrides: Record<string, unknown> = {}) {
      return {
        id: 'posting-1',
        contentHash: postingContentHash(normalized()),
        isActive: true,
        jobId: 'job-1',
        ...overrides,
      };
    }

    it('updates rather than inserting a second row', async () => {
      prisma.jobPosting.findUnique.mockResolvedValue(existing());
      prisma.jobPosting.update.mockResolvedValue({
        id: 'posting-1',
        jobId: 'job-1',
      });

      const result = await service.upsert(normalized());

      expect(prisma.jobPosting.create).not.toHaveBeenCalled();
      expect(result.postingId).toBe('posting-1');
    });

    it('reports UNCHANGED and writes only lastSeenAt when nothing moved', async () => {
      prisma.jobPosting.findUnique.mockResolvedValue(existing());
      prisma.jobPosting.update.mockResolvedValue({
        id: 'posting-1',
        jobId: 'job-1',
      });

      const result = await service.upsert(normalized());

      expect(result.outcome).toBe('UNCHANGED');
      expect(callArgs(prisma.jobPosting.update).data).toEqual({
        lastSeenAt: NOW,
      });
    });

    it('reports UPDATED and rewrites the columns when the content moved', async () => {
      prisma.jobPosting.findUnique.mockResolvedValue(existing());
      prisma.jobPosting.update.mockResolvedValue({
        id: 'posting-1',
        jobId: 'job-1',
      });

      const changed = normalized({
        title: 'Backend Developer (m/f/d)',
        description: 'Now asks for 5 years of experience.',
      });
      const result = await service.upsert(changed);

      expect(result.outcome).toBe('UPDATED');
      const data = callArgs(prisma.jobPosting.update).data as Record<
        string,
        unknown
      >;
      expect(data.title).toBe('Backend Developer (m/f/d)');
      expect(data.description).toBe('Now asks for 5 years of experience.');
      expect(data.contentHash).toBe(postingContentHash(changed));
      expect(data.lastSeenAt).toEqual(NOW);
    });

    it('bumps lastSeenAt even on the unchanged path', async () => {
      // The staleness sweep (M5.6) reads this column. If an unchanged re-fetch left
      // it alone, every posting a source never edits would eventually be retired.
      prisma.jobPosting.findUnique.mockResolvedValue(existing());
      prisma.jobPosting.update.mockResolvedValue({
        id: 'posting-1',
        jobId: 'job-1',
      });

      await service.upsert(normalized());

      expect(
        (callArgs(prisma.jobPosting.update).data as { lastSeenAt: Date })
          .lastSeenAt,
      ).toEqual(NOW);
    });

    it('never overwrites firstSeenAt or the identity pair', async () => {
      prisma.jobPosting.findUnique.mockResolvedValue(existing());
      prisma.jobPosting.update.mockResolvedValue({
        id: 'posting-1',
        jobId: 'job-1',
      });

      await service.upsert(normalized({ title: 'Something else' }));

      const data = callArgs(prisma.jobPosting.update).data as Record<
        string,
        unknown
      >;
      expect(data).not.toHaveProperty('firstSeenAt');
      expect(data).not.toHaveProperty('sourceId');
      expect(data).not.toHaveProperty('externalId');
    });

    it('leaves the cluster membership tiers 2 and 3 assigned', async () => {
      prisma.jobPosting.findUnique.mockResolvedValue(existing());
      prisma.jobPosting.update.mockResolvedValue({
        id: 'posting-1',
        jobId: 'job-1',
      });

      const result = await service.upsert(normalized({ title: 'Changed' }));

      expect(callArgs(prisma.jobPosting.update).data).not.toHaveProperty(
        'jobId',
      );
      expect(result.jobId).toBe('job-1');
    });

    it('reactivates a posting the source is listing again', async () => {
      prisma.jobPosting.findUnique.mockResolvedValue(
        existing({ isActive: false }),
      );
      prisma.jobPosting.update.mockResolvedValue({
        id: 'posting-1',
        jobId: 'job-1',
      });

      // Identical content: only the reactivation makes this an update.
      const result = await service.upsert(normalized());

      expect(result.outcome).toBe('UPDATED');
      expect(
        (callArgs(prisma.jobPosting.update).data as { isActive: boolean })
          .isActive,
      ).toBe(true);
    });
  });

  describe('two runs racing on one identity', () => {
    it('treats the unique violation as a match and updates instead', async () => {
      prisma.jobPosting.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'posting-1',
          contentHash: 'written-by-the-winner',
          isActive: true,
          jobId: null,
        });
      prisma.jobPosting.create.mockRejectedValue(uniqueViolation());
      prisma.jobPosting.update.mockResolvedValue({
        id: 'posting-1',
        jobId: null,
      });

      const result = await service.upsert(normalized());

      expect(result.outcome).toBe('UPDATED');
      expect(result.postingId).toBe('posting-1');
    });

    it('fails loudly if the conflicting row cannot be read back', async () => {
      prisma.jobPosting.findUnique.mockResolvedValue(null);
      prisma.jobPosting.create.mockRejectedValue(uniqueViolation());

      await expect(service.upsert(normalized())).rejects.toThrow(
        /could not be read back/,
      );
    });

    it('does not swallow an unrelated database error', async () => {
      prisma.jobPosting.findUnique.mockResolvedValue(null);
      prisma.jobPosting.create.mockRejectedValue(new Error('connection lost'));

      await expect(service.upsert(normalized())).rejects.toThrow(
        'connection lost',
      );
    });
  });

  describe('an unusable identity', () => {
    // Thrown, not written: a blank externalId would collapse every posting of a
    // source onto one row through the unique constraint this tier depends on.
    it.each([
      ['sourceId', { sourceId: '' }],
      ['externalId', { externalId: '' }],
      ['url', { url: '' }],
      ['title', { title: '' }],
      ['companySlug', { companySlug: '' }],
    ])('rejects a posting with no %s', async (_field, override) => {
      await expect(service.upsert(normalized(override))).rejects.toThrow();
      expect(prisma.jobPosting.create).not.toHaveBeenCalled();
      expect(prisma.jobPosting.update).not.toHaveBeenCalled();
    });
  });
});
