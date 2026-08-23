import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO31661Alpha2,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EmploymentType, JuniorLevel, WorkplaceType } from '@prisma/client';
import { PaginationQuery } from '../../../common/dto/pagination.query';

/**
 * A query longer than this is not a search, and `websearch_to_tsquery` would
 * spend real time parsing it. The cap is on the request, not on the index.
 */
export const MAX_SEARCH_QUERY_LENGTH = 200;

/**
 * Every list parameter is capped for the same reason `q` is: a facet panel offers
 * a bounded set of chips, so a request carrying hundreds of values is not a user
 * narrowing a search, and each value is a bind parameter in the generated SQL.
 */
export const MAX_FILTER_VALUES = 20;
export const MAX_LOCATION_LENGTH = 100;
export const MAX_TECHNOLOGY_LENGTH = 50;

/**
 * `maxYearsRequired` above this is not a filter anyone means, and
 * `postedWithinDays` beyond a year is the same request as no date filter at all.
 */
export const MAX_YEARS_REQUIRED = 50;
export const MAX_POSTED_WITHIN_DAYS = 365;

/**
 * How one list parameter's raw query-string value becomes a string array.
 *
 * Repeated keys (`?workplaceType=REMOTE&workplaceType=HYBRID`) are what Angular's
 * `HttpParams` emits and are always accepted. Comma-separated values are accepted
 * *only* where a comma cannot occur inside a value — enum members and technology
 * slugs — because `?technologies=java,kotlin` read as one literal slug would
 * return zero results without saying why. `locations` is free text where "Berlin,
 * Germany" is a plausible single value, so it is never split.
 *
 * Empty entries are dropped, which makes `?technologies=` the same request as no
 * parameter rather than a filter no job can satisfy.
 */
function listOf(
  value: unknown,
  options: { split: boolean; map?: (entry: string) => string },
): unknown {
  if (value === undefined) {
    return undefined;
  }

  const entries = Array.isArray(value) ? (value as unknown[]) : [value];
  const parsed: unknown[] = [];

  for (const entry of entries) {
    // Anything that is not a string is passed through untouched so the validator
    // reports it, rather than being coerced into a value that then looks valid.
    if (typeof entry !== 'string') {
      parsed.push(entry);
      continue;
    }
    for (const part of options.split ? entry.split(',') : [entry]) {
      const trimmed = part.trim().replace(/\s+/g, ' ');
      if (trimmed.length > 0) {
        parsed.push(options.map ? options.map(trimmed) : trimmed);
      }
    }
  }

  return parsed;
}

// Enum members are a closed set where casing carries no information, so `?
// workplaceType=remote` is answered rather than rejected. Slugs are lowercase by
// definition of the vocabulary (`normalization/technologies.ts`).
const asEnumList = ({ value }: TransformFnParams): unknown =>
  listOf(value, { split: true, map: (entry) => entry.toUpperCase() });

const asSlugList = ({ value }: TransformFnParams): unknown =>
  listOf(value, { split: true, map: (entry) => entry.toLowerCase() });

const asTextList = ({ value }: TransformFnParams): unknown =>
  listOf(value, { split: false });

/**
 * The three orderings of `docs/ARCHITECTURE.md` §8.1. The wire values are the
 * mixed-case tokens that document names, and unlike the enum facets they are
 * matched **exactly**: there is no case fold that round-trips `juniorScore`, so
 * accepting `juniorscore` would mean maintaining a second spelling of each.
 */
export enum SearchSort {
  RELEVANCE = 'relevance',
  JUNIOR_SCORE = 'juniorScore',
  POSTED_AT = 'postedAt',
}

/**
 * `GET /jobs/search` — the text query (M9.1), the filters of
 * `docs/ARCHITECTURE.md` §8.1 (M9.2), `sort` (M9.3) and pagination.
 *
 * M9.5's profile-fit ranking adds **nothing** here on purpose: §8.1 lists no
 * profile parameter, and fit follows the access token rather than a flag. A
 * `profileFit` parameter therefore stays a 400, like any other the DTO does not
 * declare — a parameter the backend accepted and ignored would be worse than one
 * it refuses.
 *
 * There is no salary filter and there never will be in the MVP — salary is not in
 * the schema at all (D7, `docs/DATABASE.md` §3.4).
 */
export class SearchQuery extends PaginationQuery {
  // Query strings arrive as strings, so trimming happens here rather than in the
  // repository: "  " and "" are the same request as no `q` at all, and must not
  // reach SQL as an empty tsquery that matches nothing.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString()
  @MaxLength(MAX_SEARCH_QUERY_LENGTH)
  q?: string;

  /**
   * Canonical technology slugs — the exact values the API returns in a job's
   * `technologies[]`, which is the vocabulary `Job.technologies` is stored in.
   * An unrecognized slug matches no jobs rather than returning a 400: the
   * dictionary lives in `normalization/` and the read side may not import a
   * pipeline module (§4.3), and a facet value that has gone out of use should
   * narrow to nothing, not break the request.
   */
  @IsOptional()
  @Transform(asSlugList)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsString({ each: true })
  @MaxLength(MAX_TECHNOLOGY_LENGTH, { each: true })
  technologies?: string[];

  /** Free text matched against a job's display location. Several values widen. */
  @IsOptional()
  @Transform(asTextList)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsString({ each: true })
  @MaxLength(MAX_LOCATION_LENGTH, { each: true })
  locations?: string[];

  /**
   * ISO-3166 alpha-2. Normalization only ever writes a country code from its
   * curated alias table and never infers one from a city (M6.2), so this filter
   * is exact and a job with no country code is not a match.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsISO31661Alpha2()
  countryCode?: string;

  // Named singular to match §8.1's `workplaceType[]`: the wire contract is a
  // repeated key, and the DTO is the contract.
  @IsOptional()
  @Transform(asEnumList)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsEnum(WorkplaceType, { each: true })
  workplaceType?: WorkplaceType[];

  @IsOptional()
  @Transform(asEnumList)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsEnum(EmploymentType, { each: true })
  employmentType?: EmploymentType[];

  @IsOptional()
  @Transform(asEnumList)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsEnum(JuniorLevel, { each: true })
  juniorLevel?: JuniorLevel[];

  /**
   * Junior *suitability*, 0–100 — never a probability of being hired
   * (`docs/DATABASE.md` §4.2).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minJuniorScore?: number;

  /**
   * "Do not show me jobs that demand more than N years." Compared against the
   * *minimum* the posting states, since that is the barrier to entry.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_YEARS_REQUIRED)
  maxYearsRequired?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_POSTED_WITHIN_DAYS)
  postedWithinDays?: number;

  /**
   * Defaults to `relevance` — §8.1's default and the one that answers the
   * product's question ("jobs I should realistically consider") rather than
   * "jobs, newest first". The default is set here rather than in the service so
   * that the value is on the DTO the moment validation is done.
   */
  @IsOptional()
  @IsEnum(SearchSort)
  sort: SearchSort = SearchSort.RELEVANCE;
}
