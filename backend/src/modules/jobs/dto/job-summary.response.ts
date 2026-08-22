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
