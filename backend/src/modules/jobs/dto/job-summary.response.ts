import type {
  EmploymentType,
  JuniorLevel,
  WorkplaceType,
} from '@prisma/client';

// Hand-written projection, never a Prisma model with fields removed, so the API
// contract is decoupled from the schema (docs/ARCHITECTURE.md §4.2). The list
// omits `description` deliberately: it is the largest column on the table and a
// list of 50 jobs does not need 50 full descriptions.
//
// `juniorScore` is a 0-100 *suitability* score. It is never a probability of
// being hired, and must never be renamed to suggest one (docs/DATABASE.md §4.2).
export interface JobSummaryRow {
  id: string;
  title: string;
  companyName: string;
  location: string | null;
  countryCode: string | null;
  workplaceType: WorkplaceType | null;
  employmentType: EmploymentType | null;
  language: string;
  technologies: string[];
  postedAt: Date | null;
  effectivePostedAt: Date;
  juniorLevel: JuniorLevel | null;
  juniorScore: number | null;
  requiredMinYears: number | null;
  requiredMaxYears: number | null;
}

export class JobSummaryResponse {
  id!: string;
  title!: string;
  companyName!: string;
  location!: string | null;
  countryCode!: string | null;
  workplaceType!: WorkplaceType | null;
  employmentType!: EmploymentType | null;
  language!: string;
  technologies!: string[];
  postedAt!: Date | null;
  effectivePostedAt!: Date;
  juniorLevel!: JuniorLevel | null;
  juniorScore!: number | null;
  requiredMinYears!: number | null;
  requiredMaxYears!: number | null;
  /** Distinct sources carrying this job — the "also listed on N sources" count. */
  sourceCount!: number;

  static fromEntity(
    job: JobSummaryRow,
    sourceCount: number,
  ): JobSummaryResponse {
    const response = new JobSummaryResponse();
    response.id = job.id;
    response.title = job.title;
    response.companyName = job.companyName;
    response.location = job.location;
    response.countryCode = job.countryCode;
    response.workplaceType = job.workplaceType;
    response.employmentType = job.employmentType;
    response.language = job.language;
    response.technologies = job.technologies;
    response.postedAt = job.postedAt;
    response.effectivePostedAt = job.effectivePostedAt;
    response.juniorLevel = job.juniorLevel;
    response.juniorScore = job.juniorScore;
    response.requiredMinYears = job.requiredMinYears;
    response.requiredMaxYears = job.requiredMaxYears;
    response.sourceCount = sourceCount;
    return response;
  }
}

/**
 * Distinct sources carrying a job — the "also listed on N sources" count. One
 * source can hold two postings for the same vacancy, so the postings are reduced
 * to their source ids first.
 *
 * It lives beside the DTO because three Prisma reads now project this same
 * summary (`jobs`, `saved-jobs`, and M10.2's redirect resolution) and a fourth
 * inline `new Set(...)` is one more place for the two counts to drift apart.
 * `search/` does not use it: its count is computed in SQL (§5.4).
 */
export function countDistinctSources(
  postings: readonly { sourceId: string }[],
): number {
  return new Set(postings.map((posting) => posting.sourceId)).size;
}

/**
 * M10.2 — a job summary reached by following a saved job's merge chain, plus the
 * one fact about the canonical row a summary does not carry.
 *
 * `isActive` is here rather than on `JobSummaryResponse` because the discovery
 * lists filter on it (`LISTABLE_JOBS_WHERE`), so there it would be a constant
 * `true` on every card. The saved list is the only place it can vary, and the
 * only place a client has to render it.
 */
export interface ResolvedJobSummary {
  /** The canonical job, with `mergedIntoJobId` already followed to its end. */
  readonly job: JobSummaryResponse;
  /** Whether that canonical job is still listed (`docs/DATABASE.md` §8). */
  readonly isActive: boolean;
}
