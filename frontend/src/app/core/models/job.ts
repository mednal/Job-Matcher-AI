import { EmploymentType, JuniorLevel, WorkplaceType } from './enums';

/**
 * Dates arrive as ISO-8601 strings — JSON has no date type, and `HttpClient`
 * does not revive them. They are typed as `string` rather than `Date` so the
 * type says what is actually in the object; a component that needs a `Date`
 * constructs one at the point of use.
 */
export type IsoDateString = string;

/**
 * One piece of evidence behind a classification: `{ code, weight, evidence }`
 * (`docs/DATABASE.md` §4.1). `evidence` is a verbatim excerpt from the
 * description and is non-negotiable — the UI never shows a signal without it.
 */
export interface ClassificationSignal {
  code: string;
  weight: number;
  evidence: string;
}

export interface JobClassification {
  classifierVersion: string;
  level: JuniorLevel;
  /**
   * 0-100 *suitability* for a junior candidate. It is never the probability of
   * being hired and must never be labelled as one (`PRODUCT.md` §8).
   */
  score: number;
  minYears: number | null;
  maxYears: number | null;
  positiveSignals: ClassificationSignal[];
  negativeSignals: ClassificationSignal[];
  summary: string | null;
  classifiedAt: IsoDateString;
}

/** One source carrying a job, with the attribution the UI must render (§7.4). */
export interface JobSource {
  sourceKey: string;
  sourceName: string;
  url: string;
  attributionText: string | null;
}

/**
 * A job as the list endpoints return it. No `description`: the backend omits it
 * from list projections deliberately, and a result card does not need it.
 *
 * There is no salary field anywhere in this file, and that is not an omission —
 * salary is excluded from the MVP by D7 and is not in the schema at all.
 */
export interface JobSummary {
  id: string;
  title: string;
  companyName: string;
  location: string | null;
  countryCode: string | null;
  workplaceType: WorkplaceType | null;
  employmentType: EmploymentType | null;
  language: string;
  technologies: string[];
  postedAt: IsoDateString | null;
  effectivePostedAt: IsoDateString;
  juniorLevel: JuniorLevel | null;
  /** Junior suitability, 0-100 — see `JobClassification.score`. */
  juniorScore: number | null;
  requiredMinYears: number | null;
  requiredMaxYears: number | null;
  /** Distinct sources carrying this job — the "also listed on N sources" count. */
  sourceCount: number;
}

export interface JobDetail extends Omit<JobSummary, 'sourceCount'> {
  description: string;
  /** False once every posting behind the job went stale (`docs/DATABASE.md` §8). */
  isActive: boolean;
  classifiedAt: IsoDateString | null;
  /** Null when the job has not been classified yet. */
  classification: JobClassification | null;
  /** Every source URL, so no source is hidden behind the canonical job. */
  sources: JobSource[];
  /**
   * Set when the requested id had been merged away and this canonical job was
   * served instead, so a client holding the old id can update its link.
   */
  redirectedFromJobId: string | null;
}
