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
 * M9.1–M9.5 — the search read path, and the only place raw SQL lives on the query side
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
  readonly countryCode: string[];
  readonly workplaceType: WorkplaceType[];
  readonly employmentType: EmploymentType[];
  readonly juniorLevel: JuniorLevel[];
  readonly minJuniorScore: number | null;
  readonly maxYearsRequired: number | null;
  readonly postedWithinDays: number | null;
}

/**
 * M9.5/M11.12 — the caller's saved preferences, already reduced to the things
 * ranking uses (`docs/ARCHITECTURE.md` §6.5). The service passes `null` for an
 * anonymous request *and* for a profile that names none of them, so the
 * repository has one condition to test rather than three.
 *
 * These are preferences, never predicates: nothing here narrows the result set.
 * A profile that filtered would hide jobs the user never asked to hide, and would
 * make the same URL mean different things to different people.
 */
export interface ProfileFit {
  /** Canonical technology slugs, the vocabulary `Job.technologies` is stored in. */
  readonly technologies: string[];
  /** Free text, matched against a job's display location as M9.2's filter does. */
  readonly locations: string[];
  /** ISO-3166 alpha-2, matched exactly against `Job.countryCode`. */
  readonly countryCodes: string[];
  /**
   * M11.12 — professional experience the caller already has, or `null` when it
   * should not rank at all. See `RELEVANCE_PROFILE_SHARES.experience` for why
   * zero years arrives here as `null` rather than as `0`.
   */
  readonly yearsOfExperience: number | null;
}

/** What one page of results is asked for. */
export interface SearchCriteria {
  /** Already trimmed; `null` means "no text query", not "empty text query". */
  readonly q: string | null;
  readonly filters: SearchFilters;
  readonly sort: SearchSort;
  /** `null` when the request is anonymous or the profile says nothing usable. */
  readonly profile: ProfileFit | null;
  readonly skip: number;
  readonly take: number;
}

/** No filter requested — the shape a caller that only searches text passes. */
export const NO_FILTERS: SearchFilters = Object.freeze({
  technologies: [],
  locations: [],
  countryCode: [],
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
   * M9.6 — the current classification's two signal arrays, flat rather than
   * nested, because a correlated subquery returns a column and not a relation.
   * `JobSummaryResponse.fromEntity` reads either shape.
   */
  readonly positiveSignals: unknown;
  readonly negativeSignals: unknown;
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
 * M9.5 — what profile fit is worth in the blend, for a request that has a profile
 * to fit against. The other three terms are scaled by `1 - this`, so their
 * proportions to one another are exactly what they were before this milestone and
 * an anonymous request is ranked by the identical expression. Adding a fourth term
 * must not silently re-tune the first three.
 *
 * `0.2` is deliberately smaller than suitability's share: the product's promise is
 * "jobs genuinely suitable for a junior", and a profile is a preference, not a
 * correction to that. It is large enough to reorder near-equal jobs and too small
 * to lift a job the user is not ready for over one they are. Tuned in M12.3 with
 * the rest of the blend.
 */
const RELEVANCE_PROFILE_WEIGHT = 0.2;

/**
 * How the fit term splits between the things a profile can say.
 *
 * The shares are *relative*: `profileFit` divides each by the total of the sides
 * the profile actually filled in, so they always sum to 1 over the sides present
 * and a fully-filled side is never capped below it. That is the same rule M9.5
 * expressed as "forfeit your share to the other one", generalized — with only
 * technologies and place present it still yields exactly 0.6 and 0.4.
 *
 * Technologies carry the most because they discriminate the most: most result
 * sets are already narrowed by where the user is looking, while the skills a
 * posting names differ job by job.
 *
 * `experience` is M11.12's, and it is the smallest because it is the newest and
 * the least validated — M12.3 tunes the whole blend against real data. It is
 * also the one side a profile can be *silent* about while still holding a value:
 * `yearsOfExperience` defaults to 0 and is non-null, so an untouched profile
 * would otherwise acquire a ranking term its owner never asked for. At zero
 * years the term would also say almost exactly what `juniorScore` already says
 * with 0.35 of the blend, so it is skipped there and earns its place only where
 * it adds something new: the candidate with two or three years, for whom a job
 * asking for three is reachable and `juniorScore` alone says otherwise.
 */
const RELEVANCE_PROFILE_SHARES = {
  technologies: 0.6,
  place: 0.4,
  experience: 0.3,
} as const;

/**
 * How far past a candidate's stated experience a posting may reach and still
 * count as reachable.
 *
 * One year, because a stated minimum is a filter a human wrote, not a measured
 * boundary, and "3+ years" is routinely written by teams that will read a strong
 * two-year CV. Reaching further would start recommending jobs on the strength of
 * optimism rather than evidence, which is the failure this product exists to fix.
 */
const PROFILE_EXPERIENCE_REACH = 1;

/** No stated minimum is no evidence either way, so the term sits at its midpoint. */
const PROFILE_EXPERIENCE_UNSTATED = 0.5;

/**
 * Matching this many of the user's technologies is already a full technology fit.
 *
 * Without a saturation point the denominator would be the size of the profile's
 * list, and a user who saved ten skills would need all ten to score what a user
 * who saved one scores with one — the term would quietly do less work the more
 * carefully someone filled in their profile. Three shared technologies is a strong
 * signal whether the list holds three or thirty.
 */
const PROFILE_TECHNOLOGY_SATURATION = 3;

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
 * M9.6 — the current classification's evidence, one JSON column at a time.
 *
 * A correlated subquery for the same reason `SOURCE_COUNT` is one: the outer
 * query keeps one row per job, so `LIMIT` still means "this many jobs". It is
 * answered by `JobClassification_one_current_idx`, M2.5's partial unique index
 * over `jobId WHERE isCurrent`, which is exactly this lookup.
 *
 * The column name is `Prisma.raw` but never comes from a request — the two call
 * sites below pass literals, and there is no code path that reaches this with
 * anything else.
 */
function currentSignals(
  column: 'positiveSignals' | 'negativeSignals',
): Prisma.Sql {
  return Prisma.sql`(
    SELECT "JobClassification".${Prisma.raw(`"${column}"`)}
    FROM "JobClassification"
    WHERE "JobClassification"."jobId" = "Job"."id"
      AND "JobClassification"."isCurrent"
    LIMIT 1
  )`;
}

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
               ${currentSignals('positiveSignals')} AS "positiveSignals",
               ${currentSignals('negativeSignals')} AS "negativeSignals",
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

    // M11.12 — several codes widen, like every other list facet. `= ANY(...)`
    // rather than `IN (…)` because the values are a bind array; the column is
    // `char(2)` and the parameters are text, so the cast goes on the array to
    // keep `Job_countryCode_workplaceType_idx` usable.
    if (filters.countryCode.length > 0) {
      conditions.push(
        Prisma.sql`"Job"."countryCode" = ANY(ARRAY[${Prisma.join(
          filters.countryCode,
        )}]::text[])`,
      );
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

      // M9.5 — profile fit rides on `relevance` only. `juniorScore` and
      // `postedAt` are orderings the caller named outright, and quietly blending
      // a preference into an explicit sort is the same failure as ignoring a
      // filter: the answer stops being the one that was asked for.
      case SearchSort.RELEVANCE:
        return Prisma.sql`${this.relevance(
          criteria.q,
          criteria.profile,
        )} DESC, ${tiebreak}`;
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
   * - **Profile fit** (M9.5): present only when the caller is authenticated and
   *   has saved something to fit against. It takes `RELEVANCE_PROFILE_WEIGHT` and
   *   the other three are scaled by the remainder, so an anonymous request is
   *   ranked by exactly the expression it was before.
   */
  private relevance(q: string | null, profile: ProfileFit | null): Prisma.Sql {
    const ageInDays = Prisma.sql`(EXTRACT(EPOCH FROM (NOW() - "Job"."effectivePostedAt")) / 86400.0)::float8`;

    // 1 when there is nothing to fit against, so the three terms keep their own
    // weights and an anonymous request is ranked by the pre-M9.5 expression.
    const scale = profile === null ? 1 : 1 - RELEVANCE_PROFILE_WEIGHT;

    const fit =
      profile === null
        ? Prisma.empty
        : Prisma.sql`+ ${RELEVANCE_PROFILE_WEIGHT}::float8 * ${this.profileFit(
            profile,
          )}`;

    return Prisma.sql`(
      ${RELEVANCE_TEXT_WEIGHT * scale}::float8 * ${this.rank(q)}::float8
      + ${RELEVANCE_SCORE_WEIGHT * scale}::float8 * (COALESCE("Job"."juniorScore", 0)::float8 / 100.0)
      + ${RELEVANCE_RECENCY_WEIGHT * scale}::float8 * (1.0 / (1.0 + ${ageInDays} / ${RELEVANCE_HALF_LIFE_DAYS}::float8))
      ${fit}
    )`;
  }

  /**
   * M9.5 — how well one job fits the caller's saved preferences, in `[0,1]`, so it
   * blends on the same scale as the other three terms.
   *
   * It is computed here, per query, and nothing about it is ever written back: the
   * stored `juniorScore` describes the job and stays user-independent and
   * cacheable (`docs/ARCHITECTURE.md` §6.5). Two users therefore see the same
   * jobs — the same `total`, the same `juniorScore` on every row — in different
   * orders, which is the whole of what this milestone changes.
   *
   * The caller guarantees at least one side is non-empty; a profile that names
   * neither reaches the repository as `null`.
   */
  private profileFit(profile: ProfileFit): Prisma.Sql {
    // Each side the profile actually filled in, with the share it asks for.
    // A side the profile is silent about is simply absent, and the normalization
    // below hands its share to the others rather than capping a fully-filled
    // side below 1.
    const sides: { share: number; fit: Prisma.Sql }[] = [];

    if (profile.technologies.length > 0) {
      sides.push({
        share: RELEVANCE_PROFILE_SHARES.technologies,
        fit: this.technologyFit(profile.technologies),
      });
    }
    if (profile.locations.length > 0 || profile.countryCodes.length > 0) {
      sides.push({
        share: RELEVANCE_PROFILE_SHARES.place,
        fit: this.placeFit(profile),
      });
    }
    if (profile.yearsOfExperience !== null) {
      sides.push({
        share: RELEVANCE_PROFILE_SHARES.experience,
        fit: this.experienceFit(profile.yearsOfExperience),
      });
    }

    const total = sides.reduce((sum, side) => sum + side.share, 0);
    const terms = sides.map(
      (side) => Prisma.sql`${side.share / total}::float8 * ${side.fit}`,
    );

    return Prisma.sql`(${Prisma.join(terms, ' + ')})`;
  }

  /**
   * 1 when the posting's stated minimum is within reach of the experience the
   * caller has, 0 when it is beyond it, and a neutral midpoint when the posting
   * states no minimum at all.
   *
   * The midpoint is the honest encoding of "no evidence": a job that says
   * nothing about years must not be ranked as though it had said something
   * favourable, nor punished for the silence. `maxYearsRequired` already treats
   * the same NULL as the absence of a barrier when it *filters* (M9.2) — but
   * filtering answers a yes/no question where ranking answers a how-much one,
   * and pretending silence were a perfect fit would float every unstated job to
   * the top of a personalized search.
   *
   * It ranks and never filters: a posting far beyond the caller's experience
   * scores zero here and still appears in the results.
   */
  private experienceFit(yearsOfExperience: number): Prisma.Sql {
    const reach = yearsOfExperience + PROFILE_EXPERIENCE_REACH;

    return Prisma.sql`(CASE
      WHEN "Job"."requiredMinYears" IS NULL
        THEN ${PROFILE_EXPERIENCE_UNSTATED}::float8
      WHEN "Job"."requiredMinYears" <= ${reach} THEN 1.0::float8
      ELSE 0.0::float8
    END)`;
  }

  /**
   * The share of the caller's technologies this job names, saturating at
   * `PROFILE_TECHNOLOGY_SATURATION`.
   *
   * Counted over the *profile's* list rather than the job's, so a job that lists
   * twenty technologies is not rewarded for breadth; the profile is deduplicated
   * at write time (M3.6), so each entry can contribute at most once. Both sides
   * are canonical slugs (`docs/DATABASE.md` §6), which is what makes a plain
   * equality comparison correct here.
   *
   * The denominator is computed in TypeScript because the list is known when the
   * query is built — one less subexpression evaluated per row.
   */
  private technologyFit(technologies: string[]): Prisma.Sql {
    const denominator = Math.min(
      technologies.length,
      PROFILE_TECHNOLOGY_SATURATION,
    );

    return Prisma.sql`LEAST(
      (
        SELECT COUNT(*)
        FROM unnest(ARRAY[${Prisma.join(technologies)}]::text[]) AS wanted
        WHERE wanted = ANY("Job"."technologies")
      )::float8 / ${denominator}::float8,
      1.0
    )`;
  }

  /**
   * 1 when the job sits somewhere the caller named, 0 otherwise.
   *
   * Binary rather than graded: `Profile.locations` is free text and
   * `Profile.countryCodes` is ISO alpha-2, two vocabularies with no common scale,
   * so any ranking *between* a city hit and a country hit would be invented. The
   * text match reuses M9.2's `ILIKE` semantics deliberately — a place must mean
   * the same thing when it ranks as when it filters.
   *
   * `Job.location` and `Job.countryCode` are both nullable and `NULL ILIKE …` is
   * `NULL`, which the `CASE` resolves to 0: an unplaced job is not a match, it is
   * an absence of evidence, and it still appears in the results.
   */
  private placeFit(profile: ProfileFit): Prisma.Sql {
    const matches: Prisma.Sql[] = profile.locations.map(
      (location) =>
        Prisma.sql`"Job"."location" ILIKE ${likeContains(location)}`,
    );

    if (profile.countryCodes.length > 0) {
      matches.push(
        Prisma.sql`"Job"."countryCode" = ANY(ARRAY[${Prisma.join(
          profile.countryCodes,
        )}]::text[])`,
      );
    }

    return Prisma.sql`(CASE WHEN ${Prisma.join(
      matches,
      ' OR ',
    )} THEN 1.0::float8 ELSE 0.0::float8 END)`;
  }
}
