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
  /**
   * M9.6 — the strongest evidence behind the level, capped by the API at two
   * per polarity. It is what lets a *list* show the number at all: §6.5 permits
   * the figure only where its evidence is on the same page, and a card with
   * neither array populated falls back to the `JuniorLevel` band on its own.
   */
  positiveSignals: ClassificationSignal[];
  negativeSignals: ClassificationSignal[];
  /**
   * M11.10 — the title reads junior and the posting's own stated minimum
   * contradicts it. Computed by the API, not here, so the title vocabulary has
   * one definition and cannot drift from the classifier that used it.
   */
  juniorTitleContradicted: boolean;
  /** Distinct sources carrying this job — the "also listed on N sources" count. */
  sourceCount: number;
}

/**
 * `GET /jobs/:id`. The list-only fields are dropped rather than inherited:
 * `sourceCount` becomes the full `sources` array, and the summary's capped
 * `positiveSignals` / `negativeSignals` become the complete set under
 * `classification`. `juniorTitleContradicted` is a summary field too — the
 * detail page states both halves of the contradiction in full (the experience
 * row and every signal), so it has no need of the shorthand.
 */
export interface JobDetail extends Omit<
  JobSummary,
  'sourceCount' | 'positiveSignals' | 'negativeSignals' | 'juniorTitleContradicted'
> {
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
