import {
  countDistinctSources,
  JobSummaryResponse,
  JobSummaryRow,
  ResolvedJobSummary,
} from '../../jobs/dto/job-summary.response';

/**
 * One saved row as it arrives from Prisma: the save, plus the job it points at.
 *
 * The join carries two columns beyond the shared summary. `isActive` is what
 * M10.2 flags; `mergedIntoJobId` is only read as a *question* — is this row a
 * tombstone? — so the common page, where it is null everywhere, resolves nothing
 * and costs no second query.
 */
export interface SavedJobRow {
  jobId: string;
  createdAt: Date;
  job: JobSummaryRow & {
    isActive: boolean;
    mergedIntoJobId: string | null;
    postings: { sourceId: string }[];
  };
}

/**
 * One entry of `GET /saved-jobs`: when it was saved, and the same job summary the
 * search and job lists return, so a client renders one card everywhere.
 *
 * `SavedJob.id` is deliberately not exposed. No route names a saved row by it —
 * `DELETE /saved-jobs/:jobId` addresses the job, scoped to the caller — and
 * publishing an identifier nothing accepts invites a client to build against it.
 * The natural key is `(userId, jobId)`, and `userId` is never in the response
 * because it is always the caller's.
 */
export class SavedJobResponse {
  /**
   * The job id **as saved**, which is also the id `DELETE /saved-jobs/:jobId`
   * takes. After a merge it is no longer `job.id`, and it deliberately still is
   * not rewritten: the row the user created is the row they unsave.
   */
  jobId!: string;
  savedAt!: Date;
  /**
   * Whether the job shown is still listed. `false` is not an error and not a
   * reason to hide the entry — the user saved it, and a job that has gone stale
   * is exactly the thing they need told (`docs/DATABASE.md` §8).
   */
  isActive!: boolean;
  /**
   * M10.2 — set when the saved job had been merged away (D2) and its survivor is
   * shown instead, so a client can update its link. `null` for the ordinary case.
   * Redundant with `job.id !== jobId` only if a client thinks to compare them.
   */
  redirectedToJobId!: string | null;
  /** The canonical job — the merge chain already followed. */
  job!: JobSummaryResponse;

  /**
   * `resolved` is the canonical summary when the saved job was merged away, and
   * `null` when the saved job *is* the canonical one — or when its merge chain is
   * broken, in which case the stored row is shown rather than dropping an entry
   * from the user's collection over a data defect.
   */
  static fromEntity(
    row: SavedJobRow,
    resolved: ResolvedJobSummary | null,
  ): SavedJobResponse {
    const response = new SavedJobResponse();
    response.jobId = row.jobId;
    response.savedAt = row.createdAt;
    response.job =
      resolved?.job ??
      JobSummaryResponse.fromEntity(
        row.job,
        countDistinctSources(row.job.postings),
      );
    response.isActive = resolved?.isActive ?? row.job.isActive;
    // Guarded rather than assumed: a job that resolved to itself is not a
    // redirect, and telling a client to follow one would be a pointless hop.
    response.redirectedToJobId =
      response.job.id === row.jobId ? null : response.job.id;
    return response;
  }
}
