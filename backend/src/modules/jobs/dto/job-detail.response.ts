import type {
  EmploymentType,
  JuniorLevel,
  WorkplaceType,
} from '@prisma/client';

/** `{ code, weight, evidence }` per docs/DATABASE.md §4.1. */
export class SignalResponse {
  code!: string;
  weight!: number;
  /** Verbatim excerpt from the description — non-negotiable per §4.1. */
  evidence!: string;
}

export class JobClassificationResponse {
  classifierVersion!: string;
  level!: JuniorLevel;
  /** 0-100 suitability for a 0-2 year candidate, never a hiring probability (§4.2). */
  score!: number;
  minYears!: number | null;
  maxYears!: number | null;
  positiveSignals!: SignalResponse[];
  negativeSignals!: SignalResponse[];
  summary!: string | null;
  classifiedAt!: Date;
}

/** One source carrying this job, with the attribution the UI must render (§7.4). */
export class JobSourceResponse {
  sourceKey!: string;
  sourceName!: string;
  url!: string;
  attributionText!: string | null;
}

export interface JobClassificationRow {
  classifierVersion: string;
  level: JuniorLevel;
  score: number;
  minYears: number | null;
  maxYears: number | null;
  // Prisma types these as Json; they are parsed defensively below rather than
  // trusted, because the database enforces no shape over them (§4.1).
  positiveSignals: unknown;
  negativeSignals: unknown;
  summary: string | null;
  createdAt: Date;
}

export interface JobPostingRow {
  url: string;
  source: {
    key: string;
    displayName: string;
    attributionText: string | null;
  };
}

export interface JobDetailRow {
  id: string;
  title: string;
  companyName: string;
  location: string | null;
  countryCode: string | null;
  workplaceType: WorkplaceType | null;
  employmentType: EmploymentType | null;
  language: string;
  description: string;
  technologies: string[];
  postedAt: Date | null;
  effectivePostedAt: Date;
  isActive: boolean;
  juniorLevel: JuniorLevel | null;
  juniorScore: number | null;
  requiredMinYears: number | null;
  requiredMaxYears: number | null;
  classifiedAt: Date | null;
  postings: JobPostingRow[];
  /** The current classification, or none if the job has not been classified yet. */
  classifications: JobClassificationRow[];
}

function isSignal(value: unknown): value is SignalResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.code === 'string' &&
    typeof candidate.weight === 'number' &&
    typeof candidate.evidence === 'string'
  );
}

// Signals are JSON with no database constraint (docs/DATABASE.md §4.1), so a
// malformed entry is possible in principle. Dropping it keeps the explanation
// renderable instead of failing the whole job detail on one bad row.
export function toSignals(value: unknown): SignalResponse[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isSignal).map((signal) => {
    const response = new SignalResponse();
    response.code = signal.code;
    response.weight = signal.weight;
    response.evidence = signal.evidence;
    return response;
  });
}

export class JobDetailResponse {
  id!: string;
  title!: string;
  companyName!: string;
  location!: string | null;
  countryCode!: string | null;
  workplaceType!: WorkplaceType | null;
  employmentType!: EmploymentType | null;
  language!: string;
  description!: string;
  technologies!: string[];
  postedAt!: Date | null;
  effectivePostedAt!: Date;
  /** False once every posting behind the job went stale (docs/DATABASE.md §8). */
  isActive!: boolean;
  juniorLevel!: JuniorLevel | null;
  juniorScore!: number | null;
  requiredMinYears!: number | null;
  requiredMaxYears!: number | null;
  classifiedAt!: Date | null;
  classification!: JobClassificationResponse | null;
  /** Every source URL for this job, so no source is hidden behind the canonical row. */
  sources!: JobSourceResponse[];
  /**
   * Set when the requested job had been merged away (D2) and this canonical job
   * was served instead, so a client holding the old id can update its link.
   */
  redirectedFromJobId!: string | null;

  static fromEntity(
    job: JobDetailRow,
    redirectedFromJobId: string | null,
  ): JobDetailResponse {
    const response = new JobDetailResponse();
    response.id = job.id;
    response.title = job.title;
    response.companyName = job.companyName;
    response.location = job.location;
    response.countryCode = job.countryCode;
    response.workplaceType = job.workplaceType;
    response.employmentType = job.employmentType;
    response.language = job.language;
    response.description = job.description;
    response.technologies = job.technologies;
    response.postedAt = job.postedAt;
    response.effectivePostedAt = job.effectivePostedAt;
    response.isActive = job.isActive;
    response.juniorLevel = job.juniorLevel;
    response.juniorScore = job.juniorScore;
    response.requiredMinYears = job.requiredMinYears;
    response.requiredMaxYears = job.requiredMaxYears;
    response.classifiedAt = job.classifiedAt;
    response.classification = toClassification(job.classifications[0]);
    response.sources = job.postings.map(toSource);
    response.redirectedFromJobId = redirectedFromJobId;
    return response;
  }
}

function toClassification(
  row: JobClassificationRow | undefined,
): JobClassificationResponse | null {
  if (!row) {
    return null;
  }
  const response = new JobClassificationResponse();
  response.classifierVersion = row.classifierVersion;
  response.level = row.level;
  response.score = row.score;
  response.minYears = row.minYears;
  response.maxYears = row.maxYears;
  response.positiveSignals = toSignals(row.positiveSignals);
  response.negativeSignals = toSignals(row.negativeSignals);
  response.summary = row.summary;
  response.classifiedAt = row.createdAt;
  return response;
}

function toSource(posting: JobPostingRow): JobSourceResponse {
  const response = new JobSourceResponse();
  response.sourceKey = posting.source.key;
  response.sourceName = posting.source.displayName;
  response.url = posting.url;
  response.attributionText = posting.source.attributionText;
  return response;
}
