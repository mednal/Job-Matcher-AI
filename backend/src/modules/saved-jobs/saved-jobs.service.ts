import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PaginatedResponse } from '../../common/dto/paginated.response';
import { JOB_SUMMARY_SELECT, JobsService } from '../jobs/jobs.service';
import { ResolvedJobSummary } from '../jobs/dto/job-summary.response';
import { SavedJobResponse } from './dto/saved-job.response';

/**
 * The shared job summary plus the two columns only this list needs: `isActive`,
 * which M10.2 flags rather than filters, and `mergedIntoJobId`, read purely to
 * decide whether the row has to be resolved at all.
 *
 * The discovery lists need neither, because `LISTABLE_JOBS_WHERE` has already
 * excluded every row where they would say anything.
 */
const SAVED_JOB_SELECT = {
  ...JOB_SUMMARY_SELECT,
  isActive: true,
  mergedIntoJobId: true,
};

/** Shared, so the common page allocates nothing to say "nothing was merged". */
const NO_REDIRECTS: ReadonlyMap<string, ResolvedJobSummary> = new Map();

/**
 * M10.1 — the only place `prisma.savedJob` is touched
 * (`docs/ARCHITECTURE.md` §4.2). Prisma types stay inside this file: every method
 * returns a response DTO, a boolean, or nothing.
 *
 * **Ownership is structural, not checked.** Every method takes `userId` as its
 * first argument and puts it in the `where` clause; no method accepts a
 * `SavedJob` id, so there is no parameter through which one account could address
 * another's rows. That is the same rule `ProfilesService` follows, and it cannot
 * be forgotten the way an `if (row.userId !== userId)` can.
 */
@Injectable()
export class SavedJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
  ) {}

  /**
   * One page of the caller's saved jobs, most recently saved first —
   * `SavedJob(userId, createdAt DESC)` exists for exactly this query
   * (`docs/DATABASE.md` §7).
   *
   * `jobId` breaks ties on `createdAt`, for the reason M4.2 gave: without a total
   * order two rows saved in the same millisecond can swap places between page 1
   * and page 2 and hide one from anyone paging through.
   *
   * Merged and deactivated jobs are **not** filtered out. `LISTABLE_JOBS_WHERE`
   * is right for a discovery list, where a stale job is noise; here it would
   * delete rows from the user's own collection on their behalf.
   *
   * M10.2 — what happens to them instead:
   *
   * - **Merged away (D2):** the entry shows the *survivor's* card, resolved
   *   through `mergedIntoJobId` by `JobsService`, with `redirectedToJobId` naming
   *   it. `jobId` still reports the id the user saved, because that is the row
   *   they own and the id `DELETE /saved-jobs/:jobId` takes; rewriting the save
   *   is what M7.4 decided against.
   * - **Deactivated:** listed, flagged `isActive: false`. The user is told the
   *   job is stale rather than having it silently vanish.
   */
  async list(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResponse<SavedJobResponse>> {
    const where = { userId };

    // One transaction, so `total` describes the same snapshot the page came from.
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.savedJob.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { jobId: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          jobId: true,
          createdAt: true,
          job: { select: SAVED_JOB_SELECT },
        },
      }),
      this.prisma.savedJob.count({ where }),
    ]);

    // Only the tombstones are resolved, so a page with nothing merged on it —
    // which is nearly every page — makes no second query at all.
    const merged = rows
      .filter((row) => row.job.mergedIntoJobId !== null)
      .map((row) => row.jobId);
    const redirects =
      merged.length > 0
        ? await this.jobs.findCanonicalSummaries(merged)
        : NO_REDIRECTS;

    return PaginatedResponse.of(
      rows.map((row) =>
        SavedJobResponse.fromEntity(row, redirects.get(row.jobId) ?? null),
      ),
      page,
      pageSize,
      total,
    );
  }

  /**
   * Saves a job for the caller, idempotently.
   *
   * An `upsert` on the `(userId, jobId)` unique rather than "read, then create if
   * absent": idempotency becomes a property the database enforces, and two
   * simultaneous saves cannot race into a unique-constraint 500. The update
   * branch is empty on purpose — `SavedJob` has no `@updatedAt`, so re-saving
   * leaves `createdAt` at the *first* save, which is what "already saved" means.
   */
  async save(userId: string, jobId: string): Promise<void> {
    await this.prisma.savedJob.upsert({
      where: { userId_jobId: { userId, jobId } },
      create: { userId, jobId },
      update: {},
    });
  }

  /**
   * Removes the caller's save of a job. `true` if a row went away.
   *
   * `deleteMany` scoped by `userId`, not `delete` by id: a row belonging to
   * someone else matches nothing and is reported exactly like a job the caller
   * never saved. The two cases are indistinguishable *by construction*, so the
   * endpoint cannot be used to probe what another account has saved.
   */
  async remove(userId: string, jobId: string): Promise<boolean> {
    const { count } = await this.prisma.savedJob.deleteMany({
      where: { userId, jobId },
    });
    return count > 0;
  }
}
