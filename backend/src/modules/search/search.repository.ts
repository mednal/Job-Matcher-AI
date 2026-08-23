import { Injectable } from '@nestjs/common';
import {
  EmploymentType,
  JuniorLevel,
  Prisma,
  WorkplaceType,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JobSummaryRow } from '../jobs/dto/job-summary.response';
import { TEXT_SEARCH_CONFIGURATION_SQL } from '../../common/utils/text-search-configuration';
import { SearchSort } from './dto/search.query';

/**
 * M9.1–M9.3 — the search read path, and the only place raw SQL lives on the query side
 * (`docs/ARCHITECTURE.md` §5.4). It is raw because Prisma's query API cannot
 * express `tsvector` matching, `ts_rank`, or a `regconfig` chosen per row; every
 * other read in the application goes through Prisma.
 *
 * Confining it here is what makes the "swap PostgreSQL FTS for a search engine"
 * change a one-file change, so nothing above this file may learn what `tsquery`
 * is: the service receives rows and a total, not SQL.
 */

/**
 * The structured filters of `docs/ARCHITECTURE.md` §8.1, already parsed. Field
 * names match the query parameters they come from, so nothing can be crossed in
 * translation; an empty array or `null` means the filter was not requested, which
 * is why the service must never pass an empty array through as "match nothing".
 *
 * There is no salary filter — salary is not in the MVP schema at all (D7).
 */
export interface SearchFilters {
  readonly technologies: string[];
  readonly locations: string[];
  readonly countryCode: string | null;
  readonly workplaceType: WorkplaceType[];
  readonly employmentType: EmploymentType[];
  readonly juniorLevel: JuniorLevel[];
  readonly minJuniorScore: number | null;
  readonly maxYearsRequired: number | null;
  readonly postedWithinDays: number | null;
}

/** What one page of results is asked for. */
export interface SearchCriteria {
  /** Already trimmed; `null` means "no text query", not "empty text query". */
  readonly q: string | null;
  readonly filters: SearchFilters;
  readonly sort: SearchSort;
  readonly skip: number;
  readonly take: number;
}

/** No filter requested — the shape a caller that only searches text passes. */
export const NO_FILTERS: SearchFilters = Object.freeze({
  technologies: [],
  locations: [],
  countryCode: null,
  workplaceType: [],
  employmentType: [],
  juniorLevel: [],
  minJuniorScore: null,
  maxYearsRequired: null,
  postedWithinDays: null,
});

export interface SearchResultRow extends JobSummaryRow {
  /** Distinct sources carrying the job — the "also listed on N sources" count. */
  readonly sourceCount: number;
  /**
   * Weighted text rank, 0 when there is no text query. Internal: it orders the
   * page and is never part of the API contract, because it is only comparable
   * within one result set.
   */
  readonly rank: number;
}

export interface SearchPage {
  readonly rows: SearchResultRow[];
  readonly total: number;
}

/**
 * The same structural exclusion `JobsService.LISTABLE_JOBS_WHERE` applies, in SQL:
 * merged-away jobs (D2) and deactivated ones (`docs/DATABASE.md` §8) are never
 * results, but stay reachable by id so a saved job never dangles. This predicate
 * is also what `Job_active_search_idx` is partial on.
 *
 * The product's *default* result set additionally hides CLEARLY_EXPERIENCED jobs
 * (`PRODUCT.md` §8) — that is M9.3 and deliberately not applied here.
 */
const LISTABLE = Prisma.sql`"Job"."mergedIntoJobId" IS NULL AND "Job"."isActive"`;

/**
 * `PRODUCT.md` §8 — "show me jobs I should realistically consider", not "show me
 * as many jobs as possible". The default result set therefore hides the two bands
 * a junior candidate cannot realistically consider.
 *
 * Naming a level in `juniorLevel[]` **is** the opt-in: an explicit request is
 * answered, because a filter the backend overrides is the same failure as a
 * filter it ignores. §8.1 has no separate `includeExperienced` parameter and this
 * milestone does not invent one.
 *
 * `IS NULL` is spelled out because `NULL NOT IN (…)` evaluates to `NULL`, not
 * `TRUE` — without it every job that was never classified would silently vanish
 * from the default result set, which is the one bug this predicate could
 * plausibly ship with. An unclassified job is not *known* to be experienced, so
 * it stays.
 */
const DEFAULT_EXCLUDED_LEVELS: readonly JuniorLevel[] = [
  JuniorLevel.EXPERIENCED,
  JuniorLevel.CLEARLY_EXPERIENCED,
];

/**
 * The `relevance` blend of §8.1: text rank, junior suitability and recency, each
 * normalized to `[0,1]` before weighting.
 *
 * The weights are a starting point, in the same sense as M7.3's trigram
 * thresholds — open question 2, tuned in M12.3 against real postings.
 *
 * **A weight is not the same as the range a term actually uses**, and it is worth
 * writing down which is which. `juniorScore / 100` genuinely spans `[0,1]`, so
 * suitability contributes the full `0.35` — the widest range of the three, which
 * is the right answer for a product whose whole purpose is suitability. Recency
 * likewise spans its `0.15`. `ts_rank(…, 32)` does **not** span `[0,1)` in
 * practice: measured against this schema's `setweight` vector, a one-word title
 * hit scores about `0.38` and a description hit about `0.11`, so the text term
 * moves over roughly `0.19` and the *gap* it can open between two jobs is about
 * `0.14`. That is enough to lift a title match over a description match despite a
 * ~38-point junior-score deficit, and not enough to bury suitability entirely.
 *
 * With no text query every row scores `0` on the first term, so the ordering
 * reduces to suitability then recency without needing a second code path.
 */
const RELEVANCE_TEXT_WEIGHT = 0.5;
const RELEVANCE_SCORE_WEIGHT = 0.35;
const RELEVANCE_RECENCY_WEIGHT = 0.15;

/** Days at which the recency term has decayed to half of its value. */
const RELEVANCE_HALF_LIFE_DAYS = 30;

/**
 * Selected column-by-column rather than `SELECT *`: `searchVector` alone is
 * larger than the rest of the row, and `description` is not in a summary.
 */
const SUMMARY_COLUMNS = Prisma.sql`
  "Job"."id",
  "Job"."title",
  "Job"."companyName",
  "Job"."location",
  "Job"."countryCode",
  "Job"."workplaceType",
  "Job"."employmentType",
  "Job"."language",
  "Job"."technologies",
  "Job"."postedAt",
  "Job"."effectivePostedAt",
  "Job"."juniorLevel",
  "Job"."juniorScore",
  "Job"."requiredMinYears",
  "Job"."requiredMaxYears"
`;

/**
 * Counted in a correlated subquery rather than a join, so the outer query keeps
 * one row per job and `LIMIT` still means "this many jobs". It reads
 * `JobPosting.jobId`, which is indexed for exactly this.
 */
const SOURCE_COUNT = Prisma.sql`(
  SELECT COUNT(DISTINCT "JobPosting"."sourceId")::int
  FROM "JobPosting"
  WHERE "JobPosting"."jobId" = "Job"."id"
)`;

/**
 * `IN (…)` against a PostgreSQL enum column. Every value stays a bind parameter;
 * only the type name is literal, and it is a constant in this file rather than
 * anything that arrives with a request.
 *
 * The cast is applied to the *parameters* rather than to the column, because
 * `"Job"."juniorLevel"::text IN (…)` would forfeit
 * `Job_juniorLevel_effectivePostedAt_idx` — the index this filter exists to use.
 */
function enumIn(
  column: Prisma.Sql,
  type: string,
  values: readonly string[],
): Prisma.Sql {
  const cast = Prisma.raw(`"${type}"`);
  const casted = values.map((value) => Prisma.sql`${value}::${cast}`);
  return Prisma.sql`${column} IN (${Prisma.join(casted)})`;
}

/**
 * `%` and `_` are wildcards to `ILIKE`, so a location typed with either would
 * quietly match more than it named. Backslash is PostgreSQL's default escape
 * character and has to be escaped first.
 */
function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

@Injectable()
export class SearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of matching jobs plus the total the same criteria match.
   *
   * Both statements run in one transaction so `total` describes the snapshot the
   * page came from; a concurrent ingestion cannot make the two disagree.
   */
  async findPage(criteria: SearchCriteria): Promise<SearchPage> {
    const where = this.where(criteria);
    const rank = this.rank(criteria.q);
    const orderBy = this.orderBy(criteria);

    const [rows, totals] = await this.prisma.$transaction([
      this.prisma.$queryRaw<SearchResultRow[]>`
        SELECT ${SUMMARY_COLUMNS},
               ${SOURCE_COUNT} AS "sourceCount",
               ${rank} AS "rank"
        FROM "Job"
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${criteria.take} OFFSET ${criteria.skip}
      `,
      this.prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(*)::int AS "total" FROM "Job" WHERE ${where}
      `,
    ]);

    return { rows, total: totals[0]?.total ?? 0 };
  }

  /**
   * `websearch_to_tsquery` rather than `to_tsquery`: it accepts what a user
   * actually types — quoted phrases, `or`, a leading `-` — and never throws on
   * punctuation, so a stray `&` is a search for a word and not a 500.
   *
   * A query of nothing but stopwords parses to an empty `tsquery`, which matches
   * no rows. That is the honest answer rather than a silent match-everything.
   */
  private tsquery(q: string): Prisma.Sql {
    return Prisma.sql`websearch_to_tsquery(${TEXT_SEARCH_CONFIGURATION_SQL}, ${q})`;
  }

  /**
   * The structural exclusion, the text query and the §8.1 filters, ANDed. Each
   * part is a separate fragment rather than one interpolated string so that a
   * filter which was not requested contributes no SQL at all — an unrequested
   * filter must be indistinguishable from an absent one.
   */
  private where(criteria: SearchCriteria): Prisma.Sql {
    const conditions: Prisma.Sql[] = [LISTABLE];

    if (criteria.q !== null) {
      conditions.push(
        Prisma.sql`"Job"."searchVector" @@ ${this.tsquery(criteria.q)}`,
      );
    }
    conditions.push(...this.filters(criteria.filters));

    return Prisma.join(conditions, ' AND ');
  }

  /**
   * One fragment per requested filter (`docs/ARCHITECTURE.md` §8.1).
   *
   * Two of them treat a `NULL` column deliberately differently, because the
   * absent value means different things:
   *
   * - `maxYearsRequired` **keeps** a job that states no minimum. An unstated
   *   requirement is the absence of a barrier, and dropping those rows would hide
   *   most genuinely junior postings — the opposite of the product's purpose.
   * - `minJuniorScore` **drops** an unclassified job. Here the absent value is
   *   absence of evidence, and a request for "at least 70" cannot be answered
   *   with a job nothing has scored.
   *
   * The enum facets drop `NULL` for the same reason as the score: a posting that
   * never said it was remote is not an answer to `workplaceType=REMOTE`.
   */
  private filters(filters: SearchFilters): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [];

    // Overlap, not containment: selecting a second technology widens the result
    // set, which is how a facet panel is read. `Job_technologies_idx` (GIN)
    // supports `&&` directly.
    if (filters.technologies.length > 0) {
      conditions.push(
        Prisma.sql`"Job"."technologies" && ARRAY[${Prisma.join(
          filters.technologies,
        )}]::text[]`,
      );
    }

    // Free text against the display location, several values ORed. A substring
    // match rather than equality because `location` holds what the posting said
    // ("Berlin", "Berlin, Germany", "Berlin / Remote") — M6.2 parses out only the
    // country code, deliberately leaving the rest as written.
    if (filters.locations.length > 0) {
      const matches = filters.locations.map(
        (location) =>
          Prisma.sql`"Job"."location" ILIKE ${likeContains(location)}`,
      );
      conditions.push(Prisma.sql`(${Prisma.join(matches, ' OR ')})`);
    }

    if (filters.countryCode !== null) {
      conditions.push(Prisma.sql`"Job"."countryCode" = ${filters.countryCode}`);
    }

    if (filters.workplaceType.length > 0) {
      conditions.push(
        enumIn(
          Prisma.sql`"Job"."workplaceType"`,
          'WorkplaceType',
          filters.workplaceType,
        ),
      );
    }

    if (filters.employmentType.length > 0) {
      conditions.push(
        enumIn(
          Prisma.sql`"Job"."employmentType"`,
          'EmploymentType',
          filters.employmentType,
        ),
      );
    }

    // Naming a level opts out of the product default below; naming none leaves
    // the default result set in force (`PRODUCT.md` §8).
    if (filters.juniorLevel.length > 0) {
      conditions.push(
        enumIn(
          Prisma.sql`"Job"."juniorLevel"`,
          'JuniorLevel',
          filters.juniorLevel,
        ),
      );
    } else {
      conditions.push(
        Prisma.sql`("Job"."juniorLevel" IS NULL OR NOT ${enumIn(
          Prisma.sql`"Job"."juniorLevel"`,
          'JuniorLevel',
          DEFAULT_EXCLUDED_LEVELS,
        )})`,
      );
    }

    if (filters.minJuniorScore !== null) {
      conditions.push(
        Prisma.sql`"Job"."juniorScore" >= ${filters.minJuniorScore}`,
      );
    }

    if (filters.maxYearsRequired !== null) {
      conditions.push(
        Prisma.sql`("Job"."requiredMinYears" IS NULL OR "Job"."requiredMinYears" <= ${filters.maxYearsRequired})`,
      );
    }

    // `effectivePostedAt` and not `postedAt`: it is non-null by construction
    // (`DATABASE.md` §3.3), so a source that publishes no date still answers
    // "posted within N days" with when we first saw the job, instead of being
    // filtered out of every dated search. The interval text is built from an
    // already-validated integer.
    if (filters.postedWithinDays !== null) {
      conditions.push(
        Prisma.sql`"Job"."effectivePostedAt" >= NOW() - ${`${filters.postedWithinDays} days`}::interval`,
      );
    }

    return conditions;
  }

  /**
   * `ts_rank` with PostgreSQL's default weights `{D,C,B,A} = {0.1,0.2,0.4,1.0}`.
   * The A/B/C weights were baked into the vector by `setweight` at write time
   * (title A, company B, description C), so a title hit already outranks a
   * description hit without the query restating the weighting.
   *
   * Normalization `32` divides by `rank + 1`, putting every rank in `[0,1)` so
   * that M9.3 can blend it with the junior score and recency on a comparable
   * scale.
   *
   * With no text query every row ranks equal and the `ORDER BY` falls through to
   * recency, which is the same order `GET /jobs` uses.
   */
  private rank(q: string | null): Prisma.Sql {
    if (q === null) {
      return Prisma.sql`0::float4`;
    }
    return Prisma.sql`ts_rank("Job"."searchVector", ${this.tsquery(q)}, 32)`;
  }

  /**
   * The three orderings of §8.1.
   *
   * Every one ends in the same tiebreak, `effectivePostedAt DESC, id DESC`, for
   * the reason M4.2 gave: without a total order, two rows comparing equal can
   * swap places between page 1 and page 2 and hide a job from anyone paging
   * through. `id` is unique, so the order is total.
   */
  private orderBy(criteria: SearchCriteria): Prisma.Sql {
    const tiebreak = Prisma.sql`"Job"."effectivePostedAt" DESC, "Job"."id" DESC`;

    switch (criteria.sort) {
      case SearchSort.POSTED_AT:
        // The tiebreak already *is* this ordering.
        return tiebreak;

      // NULLS LAST is not decoration: PostgreSQL sorts NULLs first under DESC, so
      // without it "highest junior score first" would open with every job nothing
      // has scored.
      case SearchSort.JUNIOR_SCORE:
        return Prisma.sql`"Job"."juniorScore" DESC NULLS LAST, ${tiebreak}`;

      case SearchSort.RELEVANCE:
        return Prisma.sql`${this.relevance(criteria.q)} DESC, ${tiebreak}`;
    }
  }

  /**
   * The weighted blend. Each term is cast to `float8` explicitly rather than left
   * to operator resolution — `ts_rank` returns `real` and `EXTRACT` returns
   * `numeric`, and a blend whose arithmetic silently changed type would be a
   * ranking change nothing would catch.
   *
   * - **Text**: `ts_rank` normalized by 32 into `[0,1)` at M9.1, precisely so it
   *   could be blended here. `0` for every row when there is no text query.
   * - **Suitability**: `juniorScore / 100`. An unscored job contributes `0` and so
   *   ranks below every scored one — it is still *shown*, because it is not known
   *   to be unsuitable, but it cannot outrank a job we have evidence for.
   * - **Recency**: `1 / (1 + age / halfLife)`, which is `1` today and `0.5` at the
   *   half-life. Bounded and monotone, so it can never dominate the other two.
   */
  private relevance(q: string | null): Prisma.Sql {
    const ageInDays = Prisma.sql`(EXTRACT(EPOCH FROM (NOW() - "Job"."effectivePostedAt")) / 86400.0)::float8`;

    return Prisma.sql`(
      ${RELEVANCE_TEXT_WEIGHT}::float8 * ${this.rank(q)}::float8
      + ${RELEVANCE_SCORE_WEIGHT}::float8 * (COALESCE("Job"."juniorScore", 0)::float8 / 100.0)
      + ${RELEVANCE_RECENCY_WEIGHT}::float8 * (1.0 / (1.0 + ${ageInDays} / ${RELEVANCE_HALF_LIFE_DAYS}::float8))
    )`;
  }
}
