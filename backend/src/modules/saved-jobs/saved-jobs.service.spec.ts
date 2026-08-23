import { SavedJobsService } from './saved-jobs.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JOB_SUMMARY_SELECT, JobsService } from '../jobs/jobs.service';
import {
  JobSummaryResponse,
  JobSummaryRow,
  ResolvedJobSummary,
} from '../jobs/dto/job-summary.response';

interface PrismaMock {
  savedJob: {
    findMany: jest.Mock;
    count: jest.Mock;
    upsert: jest.Mock;
    deleteMany: jest.Mock;
  };
  $transaction: jest.Mock;
}

interface JobsMock {
  findCanonicalSummaries: jest.Mock;
}

function savedRow(overrides: Record<string, unknown> = {}) {
  // `job` is merged rather than replaced, so a case can say "the same row, but
  // merged away" without restating sixteen columns.
  const { job: jobOverrides, ...rest } = overrides;
  return {
    jobId: 'job-1',
    createdAt: new Date('2026-08-23T10:00:00.000Z'),
    ...rest,
    job: {
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
      isActive: true,
      mergedIntoJobId: null,
      // Two postings, one source — the count is of sources, not postings.
      postings: [{ sourceId: 'source-1' }, { sourceId: 'source-1' }],
      ...((jobOverrides as Record<string, unknown>) ?? {}),
    },
  };
}

/**
 * What `JobsService` hands back for a saved job that was merged away: a summary
 * of a *different* job, so a case can tell the survivor's card from the
 * tombstone's.
 */
function resolved(id = 'survivor-1', isActive = true): ResolvedJobSummary {
  const job = JobSummaryResponse.fromEntity(
    {
      ...savedRow().job,
      id,
      title: 'Junior Backend Engineer',
    } as unknown as JobSummaryRow,
    2,
  );
  return { job, isActive };
}

/**
 * The first argument the mock was called with, typed. `mock.calls[0][0]` is
 * `any`, and asserting through `any` is how a spec quietly stops checking
 * anything at all.
 */
function firstArg<T>(mock: jest.Mock): T {
  const [call] = mock.mock.calls as unknown[][];
  return call[0] as T;
}

describe('SavedJobsService', () => {
  let prisma: PrismaMock;
  let jobs: JobsMock;
  let service: SavedJobsService;

  beforeEach(() => {
    prisma = {
      savedJob: {
        findMany: jest.fn(),
        count: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      // The real one runs the array of queries; the mock just resolves them.
      $transaction: jest.fn((operations: unknown[]) =>
        Promise.all(operations as Promise<unknown>[]),
      ),
    };
    jobs = { findCanonicalSummaries: jest.fn().mockResolvedValue(new Map()) };
    service = new SavedJobsService(
      prisma as unknown as PrismaService,
      jobs as unknown as JobsService,
    );
  });

  describe('list', () => {
    beforeEach(() => {
      prisma.savedJob.findMany.mockResolvedValue([savedRow()]);
      prisma.savedJob.count.mockResolvedValue(1);
    });

    // The ownership rule, asserted on the query rather than on the result: a
    // `where` without `userId` would return every user's saves.
    it('scopes both the page and the count to the caller', async () => {
      await service.list('user-1', 1, 20);

      expect(prisma.savedJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
      expect(prisma.savedJob.count).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    // `SavedJob(userId, createdAt DESC)` is indexed for this, and `jobId` makes
    // the order total so two saves in the same millisecond cannot swap places
    // between pages and hide one.
    it('orders by when it was saved, newest first, with a total tiebreak', async () => {
      await service.list('user-1', 1, 20);

      expect(prisma.savedJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: 'desc' }, { jobId: 'desc' }],
        }),
      );
    });

    it('translates the page into skip/take', async () => {
      await service.list('user-1', 3, 20);

      expect(prisma.savedJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 40, take: 20 }),
      );
    });

    // One projection for the job summary, shared with `jobs/`. A second copy
    // would drift the moment either list gained a column.
    it('projects the job through the shared summary select', async () => {
      await service.list('user-1', 1, 20);

      const call = firstArg<{ select: { job: { select: unknown } } }>(
        prisma.savedJob.findMany,
      );
      // The two extra columns are this list's own: the flag M10.2 shows, and the
      // question it asks before resolving anything.
      expect(call.select.job.select).toEqual({
        ...JOB_SUMMARY_SELECT,
        isActive: true,
        mergedIntoJobId: true,
      });
    });

    // A saved job that was merged away or deactivated is still the user's. The
    // discovery lists exclude those rows; this one must not, or unsaving would
    // happen on the user's behalf without them asking.
    it('does not exclude merged or deactivated jobs', async () => {
      await service.list('user-1', 1, 20);

      const call = firstArg<{ where: Record<string, unknown> }>(
        prisma.savedJob.findMany,
      );
      expect(call.where).toEqual({ userId: 'user-1' });
    });

    it('returns the shared envelope, counting every save and not the page', async () => {
      prisma.savedJob.count.mockResolvedValue(137);

      const response = await service.list('user-1', 2, 20);

      expect(response).toEqual({
        items: [expect.objectContaining({ jobId: 'job-1' })],
        page: 2,
        pageSize: 20,
        total: 137,
      });
    });

    it('reads the page and the count in one transaction', async () => {
      await service.list('user-1', 1, 20);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('carries the save time and the job summary, and counts distinct sources', async () => {
      const [item] = (await service.list('user-1', 1, 20)).items;

      expect(item.savedAt).toEqual(new Date('2026-08-23T10:00:00.000Z'));
      expect(item.job.title).toBe('Junior Backend Developer');
      // Two postings from one source is one source.
      expect(item.job.sourceCount).toBe(1);
    });

    // The natural key is (userId, jobId); the row's own id addresses nothing.
    it('never exposes the saved row id or the owner', async () => {
      const [item] = (await service.list('user-1', 1, 20)).items;

      expect(item).not.toHaveProperty('id');
      expect(item).not.toHaveProperty('userId');
    });
  });

  // M10.2 - a saved job outlives the pipeline: the vacancy it names can be folded
  // into another job or go stale, and neither may cost the user their entry.
  describe('jobs that moved or went stale', () => {
    beforeEach(() => {
      prisma.savedJob.count.mockResolvedValue(1);
    });

    it('leaves an ordinary save alone and asks for no redirect', async () => {
      prisma.savedJob.findMany.mockResolvedValue([savedRow()]);

      const [item] = (await service.list('user-1', 1, 20)).items;

      expect(item.job.id).toBe('job-1');
      expect(item.redirectedToJobId).toBeNull();
      expect(item.isActive).toBe(true);
      // The common page costs nothing extra: no tombstone, no second query.
      expect(jobs.findCanonicalSummaries).not.toHaveBeenCalled();
    });

    it('flags a deactivated job instead of hiding it', async () => {
      prisma.savedJob.findMany.mockResolvedValue([
        savedRow({ job: { isActive: false } }),
      ]);

      const [item] = (await service.list('user-1', 1, 20)).items;

      expect(item.jobId).toBe('job-1');
      expect(item.isActive).toBe(false);
      expect(item.redirectedToJobId).toBeNull();
    });

    // The card is the survivor's; the entry is still the row the user created.
    it('shows the survivor for a job that was merged away', async () => {
      prisma.savedJob.findMany.mockResolvedValue([
        savedRow({ job: { mergedIntoJobId: 'survivor-1' } }),
      ]);
      jobs.findCanonicalSummaries.mockResolvedValue(
        new Map([['job-1', resolved()]]),
      );

      const [item] = (await service.list('user-1', 1, 20)).items;

      expect(jobs.findCanonicalSummaries).toHaveBeenCalledWith(['job-1']);
      expect(item.job.id).toBe('survivor-1');
      expect(item.job.title).toBe('Junior Backend Engineer');
      expect(item.redirectedToJobId).toBe('survivor-1');
      // `jobId` is not rewritten: it is the row the user owns, and the id
      // `DELETE /saved-jobs/:jobId` takes.
      expect(item.jobId).toBe('job-1');
    });

    // Both facts at once: the merge is followed, and the flag describes the job
    // now on the card rather than the tombstone behind it.
    it('reports whether the survivor is listed, not the tombstone', async () => {
      prisma.savedJob.findMany.mockResolvedValue([
        savedRow({ job: { isActive: true, mergedIntoJobId: 'survivor-1' } }),
      ]);
      jobs.findCanonicalSummaries.mockResolvedValue(
        new Map([['job-1', resolved('survivor-1', false)]]),
      );

      const [item] = (await service.list('user-1', 1, 20)).items;

      expect(item.isActive).toBe(false);
    });

    it('resolves only the merged rows on a mixed page', async () => {
      prisma.savedJob.findMany.mockResolvedValue([
        savedRow(),
        savedRow({ jobId: 'job-2', job: { mergedIntoJobId: 'survivor-1' } }),
      ]);
      jobs.findCanonicalSummaries.mockResolvedValue(
        new Map([['job-2', resolved()]]),
      );

      const { items } = await service.list('user-1', 1, 20);

      expect(jobs.findCanonicalSummaries).toHaveBeenCalledWith(['job-2']);
      expect(items.map((item) => item.job.id)).toEqual(['job-1', 'survivor-1']);
    });

    // A broken merge chain is a data defect, already logged where it was walked.
    // It must not remove an entry from someone's collection: the row lists as
    // stored, which is exactly what M10.1 did.
    it('falls back to the stored job when the chain cannot be resolved', async () => {
      prisma.savedJob.findMany.mockResolvedValue([
        savedRow({ job: { mergedIntoJobId: 'survivor-1' } }),
      ]);
      jobs.findCanonicalSummaries.mockResolvedValue(new Map());

      const page = await service.list('user-1', 1, 20);

      expect(page.items).toHaveLength(1);
      expect(page.items[0].job.id).toBe('job-1');
      expect(page.items[0].redirectedToJobId).toBeNull();
    });
  });

  describe('save', () => {
    // Idempotency as a database property rather than a read-then-write: two
    // simultaneous saves cannot race into a unique-constraint failure.
    it('upserts on the (userId, jobId) unique', async () => {
      prisma.savedJob.upsert.mockResolvedValue(savedRow());

      await service.save('user-1', 'job-1');

      expect(prisma.savedJob.upsert).toHaveBeenCalledWith({
        where: { userId_jobId: { userId: 'user-1', jobId: 'job-1' } },
        create: { userId: 'user-1', jobId: 'job-1' },
        update: {},
      });
    });

    // An empty update, so re-saving leaves `createdAt` at the first save. That is
    // what "already saved" means; re-stamping it would reorder the user's list.
    it('changes nothing on a job that is already saved', async () => {
      prisma.savedJob.upsert.mockResolvedValue(savedRow());

      await service.save('user-1', 'job-1');

      const call = firstArg<{ update: Record<string, unknown> }>(
        prisma.savedJob.upsert,
      );
      expect(call.update).toEqual({});
    });
  });

  describe('remove', () => {
    // Scoped by userId, so another account's row simply matches nothing. There is
    // no ownership `if` to forget, and no way to tell the two cases apart.
    it('deletes only within the callers own saves', async () => {
      prisma.savedJob.deleteMany.mockResolvedValue({ count: 1 });

      await expect(service.remove('user-1', 'job-1')).resolves.toBe(true);
      expect(prisma.savedJob.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', jobId: 'job-1' },
      });
    });

    it('reports that nothing was removed when no row matched', async () => {
      prisma.savedJob.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove('user-1', 'job-1')).resolves.toBe(false);
    });
  });
});
