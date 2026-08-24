import { EmploymentType, JuniorLevel, WorkplaceType } from './enums';
import { PageRequest } from './pagination';

/**
 * The three orderings of `docs/ARCHITECTURE.md` §8.1. The wire values are
 * mixed-case tokens matched **exactly** by the backend — `juniorscore` is a 400,
 * not a synonym — so they are written here once and never re-spelled.
 */
export const SEARCH_SORTS = ['relevance', 'juniorScore', 'postedAt'] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

export const DEFAULT_SEARCH_SORT: SearchSort = 'relevance';

/** Mirrors the caps in `backend/src/modules/search/dto/search.query.ts`. */
export const MAX_SEARCH_QUERY_LENGTH = 200;
export const MAX_FILTER_VALUES = 20;
export const MAX_LOCATION_LENGTH = 100;
export const MAX_TECHNOLOGY_LENGTH = 50;
export const MAX_YEARS_REQUIRED = 50;
export const MAX_POSTED_WITHIN_DAYS = 365;

/**
 * `GET /jobs/search`. Every field is optional: the empty query is a valid search
 * and returns the default result set.
 *
 * There is no `profileFit` flag on purpose. Profile-fit ranking follows the
 * access token, not a parameter — the backend rejects any parameter it does not
 * declare, so inventing one here would turn every search into a 400.
 */
export interface SearchQuery extends PageRequest {
  q?: string;
  /** Canonical lowercase technology slugs — the values a job's `technologies[]` uses. */
  technologies?: string[];
  /** Free text matched against a job's display location. Several values widen. */
  locations?: string[];
  /** ISO-3166 alpha-2, uppercase. */
  countryCode?: string;
  workplaceType?: WorkplaceType[];
  employmentType?: EmploymentType[];
  juniorLevel?: JuniorLevel[];
  /** Junior suitability floor, 0-100. */
  minJuniorScore?: number;
  /** "Do not show me jobs demanding more than N years." */
  maxYearsRequired?: number;
  postedWithinDays?: number;
  sort?: SearchSort;
}
