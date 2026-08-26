import type {
  EmploymentType,
  JuniorLevel,
  WorkplaceType,
} from '@prisma/client';
import {
  EXPERIENCED_FLOOR_YEARS,
  JUNIOR_TITLE_PATTERN,
} from '../../../common/utils/junior-title';
import { SignalResponse, toSignals } from './job-detail.response';

/**
 * How many signals of each polarity a *list* item carries (M9.6).
 *
 * A card has room for two lines of evidence, not the whole classification, and
 * the excerpts are the largest thing in the projection — the detail page is
 * where the full set belongs. Two per polarity keeps a 20-job page's growth to
 * roughly 10 kB while still letting `job-card` show the number at all.
 */
export const SUMMARY_SIGNAL_LIMIT = 2;

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
  /**
   * M9.6 — the current classification's evidence, in the shape a Prisma nested
   * select produces. `search/` cannot produce this shape, so the flat pair
   * below exists too; `readSignals` accepts either and every caller of
   * `fromEntity` keeps the signature it already had.
   */
  classifications?: readonly {
    positiveSignals: unknown;
    negativeSignals: unknown;
  }[];
  /** The same evidence as `search.repository.ts`'s raw SQL returns it: flat. */
  positiveSignals?: unknown;
  negativeSignals?: unknown;
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
  /**
   * M9.6 — the strongest evidence behind the level, capped at
   * `SUMMARY_SIGNAL_LIMIT`. `docs/ARCHITECTURE.md` §6.5 lets a client show the
   * *number* only when its evidence is on the same page, so a card that never
   * received these can only ever show the `JuniorLevel` band. Empty arrays
   * rather than null: an unclassified job has no evidence, which is a list, not
   * a missing field.
   */
  positiveSignals!: SignalResponse[];
  negativeSignals!: SignalResponse[];
  /**
   * M11.10 — the title reads junior and the posting's own stated minimum
   * contradicts it. This is the case the product exists to catch, and it is
   * computed here rather than on the client so the title vocabulary and the
   * threshold have one definition (`common/utils/junior-title.ts`) shared with
   * the classifier that decided the level.
   *
   * It is a statement about the *posting* — never a claim about the reader's
   * chances (`docs/DATABASE.md` §4.2).
   */
  juniorTitleContradicted!: boolean;
  /** Distinct sources carrying this job — the "also listed on N sources" count. */
  sourceCount!: number;

  static fromEntity(
    job: JobSummaryRow,
    sourceCount: number,
  ): JobSummaryResponse {
    const signals = readSignals(job);
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
    response.positiveSignals = signals.positive;
    response.negativeSignals = signals.negative;
    response.juniorTitleContradicted = contradictsItsTitle(
      job.title,
      job.requiredMinYears,
    );
    response.sourceCount = sourceCount;
    return response;
  }
}

/**
 * The strongest `limit` signals, by absolute weight.
 *
 * Weight carries the polarity's sign (docs/DATABASE.md §4.1), so the two stored
 * arrays are each one-signed and `Math.abs` orders within either of them. The
 * sort is **stable**: equal weights keep extraction order, which `signals.ts`
 * defines as earliest occurrence in the description, so two requests for the
 * same job can never disagree about which two lines a card shows.
 */
export function topSignals(
  signals: readonly SignalResponse[],
  limit: number,
): SignalResponse[] {
  if (limit <= 0) {
    return [];
  }
  return signals
    .map((signal, index) => ({ signal, index }))
    .sort(
      (a, b) =>
        Math.abs(b.signal.weight) - Math.abs(a.signal.weight) ||
        a.index - b.index,
    )
    .slice(0, limit)
    .map((entry) => entry.signal);
}

/**
 * A title that says junior over a posting that states otherwise.
 *
 * Deliberately narrow: it reads only the *stated* minimum, so a posting that
 * asks for nothing (`null`) never trips it. Absence of a figure is not evidence
 * of a contradiction, and claiming one would be the same overreach the product
 * exists to complain about.
 *
 * The senior half of the title vocabulary is not consulted. "Senior Engineer"
 * asking for five years is not a contradiction — it is a posting being honest,
 * and it is already excluded from the default result set by its level.
 */
function contradictsItsTitle(
  title: string,
  requiredMinYears: number | null,
): boolean {
  return (
    requiredMinYears !== null &&
    requiredMinYears >= EXPERIENCED_FLOOR_YEARS &&
    JUNIOR_TITLE_PATTERN.test(title)
  );
}

/**
 * The evidence, from whichever of the two row shapes the caller had.
 *
 * The nested shape is what `JOB_SUMMARY_SELECT`'s `classifications` relation
 * produces; the flat pair is what a raw `SELECT` can return, since
 * `search.repository.ts` reads the two JSON columns through correlated
 * subqueries rather than a join. Reading both here is what keeps all four
 * `fromEntity` call sites unchanged.
 */
function readSignals(job: JobSummaryRow): {
  positive: SignalResponse[];
  negative: SignalResponse[];
} {
  const current = job.classifications?.[0];
  const positive = current ? current.positiveSignals : job.positiveSignals;
  const negative = current ? current.negativeSignals : job.negativeSignals;

  return {
    positive: topSignals(toSignals(positive), SUMMARY_SIGNAL_LIMIT),
    negative: topSignals(toSignals(negative), SUMMARY_SIGNAL_LIMIT),
  };
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
