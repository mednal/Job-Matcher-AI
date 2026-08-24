import { IsoDateString, JobSummary } from './job';

/**
 * One entry of `GET /saved-jobs`. The job it carries is the same summary the
 * search and job lists return, so one card renders everywhere.
 */
export interface SavedJob {
  /**
   * The job id **as saved**, and the id `DELETE /saved-jobs/:jobId` takes. After
   * a merge it is no longer `job.id`: unsaving addresses the row the user
   * created, not the survivor it now resolves to.
   */
  jobId: string;
  savedAt: IsoDateString;
  /**
   * Whether the job shown is still listed. `false` is not an error and not a
   * reason to hide the entry — it is exactly what the user needs told.
   */
  isActive: boolean;
  /**
   * Set when the saved job had been merged away and its survivor is shown
   * instead, so the link can be updated. `null` in the ordinary case.
   */
  redirectedToJobId: string | null;
  /** The canonical job — the merge chain already followed. */
  job: JobSummary;
}
