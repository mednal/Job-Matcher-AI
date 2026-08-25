import { ParamMap, Params } from '@angular/router';
import {
  EMPLOYMENT_TYPES,
  EmploymentType,
  JUNIOR_LEVELS,
  JuniorLevel,
  WORKPLACE_TYPES,
  WorkplaceType,
} from '../../core/models/enums';
import { DEFAULT_PAGE_SIZE, MAX_PAGE, MAX_PAGE_SIZE } from '../../core/models/pagination';
import {
  DEFAULT_SEARCH_SORT,
  MAX_FILTER_VALUES,
  MAX_LOCATION_LENGTH,
  MAX_POSTED_WITHIN_DAYS,
  MAX_SEARCH_QUERY_LENGTH,
  MAX_TECHNOLOGY_LENGTH,
  MAX_YEARS_REQUIRED,
  SEARCH_SORTS,
  SearchQuery,
  SearchSort,
} from '../../core/models/search';

/**
 * The URL is the search. `ARCHITECTURE.md` §10 requires the filters to be mirrored
 * into query params so a search is shareable and survives reload, and this module
 * is the whole of that mapping: `parseSearchQuery` turns a `ParamMap` into the
 * request, `toQueryParams` turns the request back into the `Params` object
 * `Router.navigate` takes. The page keeps no filter state of its own — it reads the
 * URL and writes the URL — so the back button, a reload and a pasted link all take
 * the same path through the same code.
 *
 * **Parsing never throws and never rejects a whole URL.** A hand-edited or stale
 * link carrying `?minJuniorScore=abc`, or a `juniorLevel` this build no longer
 * knows, loses that one parameter and keeps the rest: a search missing one filter
 * is recoverable, a blank page is not. Every value is checked against the bounds
 * `backend/src/modules/search/dto/search.query.ts` declares, so what leaves here is
 * a request the API accepts rather than a 400 the user cannot act on.
 */
export function parseSearchQuery(params: ParamMap): SearchQuery {
  return defined({
    q: text(params.get('q'), MAX_SEARCH_QUERY_LENGTH),
    technologies: list(params.getAll('technologies'), MAX_TECHNOLOGY_LENGTH, lowercase),
    locations: list(params.getAll('locations'), MAX_LOCATION_LENGTH),
    countryCode: countryCodes(params.getAll('countryCode')),
    workplaceType: members(params.getAll('workplaceType'), WORKPLACE_TYPES),
    employmentType: members(params.getAll('employmentType'), EMPLOYMENT_TYPES),
    juniorLevel: members(params.getAll('juniorLevel'), JUNIOR_LEVELS),
    minJuniorScore: integer(params.get('minJuniorScore'), 0, 100),
    maxYearsRequired: integer(params.get('maxYearsRequired'), 0, MAX_YEARS_REQUIRED),
    postedWithinDays: integer(params.get('postedWithinDays'), 1, MAX_POSTED_WITHIN_DAYS),
    sort: sortOf(params.get('sort')),
    page: integer(params.get('page'), 1, MAX_PAGE),
    pageSize: integer(params.get('pageSize'), 1, MAX_PAGE_SIZE),
  });
}

/**
 * The query as a `Params` object for `Router.navigate({ queryParams })`.
 *
 * Everything is written as a string or an array of strings, which is what a URL
 * carries; the router repeats a key per array entry, the same form `toSearchParams`
 * already settled on for the request itself.
 *
 * **A value equal to the API's own default is left out**, so `sort=relevance`,
 * `page=1` and the default page size never reach the address bar. A shared link
 * then says only what the user actually chose, and the backend's defaults stay the
 * single definition of them — a link that pinned them would go on answering with
 * yesterday's default after the API had changed its mind.
 */
export function toQueryParams(query: SearchQuery): Params {
  const params: Params = {};

  put(params, 'q', query.q);
  put(params, 'technologies', query.technologies);
  put(params, 'locations', query.locations);
  put(params, 'countryCode', query.countryCode);
  put(params, 'workplaceType', query.workplaceType);
  put(params, 'employmentType', query.employmentType);
  put(params, 'juniorLevel', query.juniorLevel);
  put(params, 'minJuniorScore', digits(query.minJuniorScore));
  put(params, 'maxYearsRequired', digits(query.maxYearsRequired));
  put(params, 'postedWithinDays', digits(query.postedWithinDays));

  if (query.sort !== undefined && query.sort !== DEFAULT_SEARCH_SORT) {
    params['sort'] = query.sort;
  }
  if (query.page !== undefined && query.page > 1) {
    params['page'] = String(query.page);
  }
  if (query.pageSize !== undefined && query.pageSize !== DEFAULT_PAGE_SIZE) {
    params['pageSize'] = String(query.pageSize);
  }

  return params;
}

/**
 * One filter that is on, as a chip: what to call it, and the query without it.
 *
 * `without` is a whole `SearchQuery` rather than a key to delete, because
 * removing one of three technologies has to leave the other two — a key is not
 * fine-grained enough to say that. `page` is dropped by every removal: widening
 * a search and staying on page seven answers with an empty page far more often
 * than with what was just asked for, which is the rule `applyFilters` already
 * follows.
 */
export interface ActiveFilter {
  /** Stable across renders, so `@for` can track a chip through a removal. */
  readonly key: string;
  readonly label: string;
  readonly without: SearchQuery;
}

/**
 * Every filter currently on, in the order the panel presents them.
 *
 * This is the single description of what a filter *is*: the chips render it and
 * `activeFilterCount` counts it, so the row of chips and the "N on" badge cannot
 * disagree about whether something is on.
 *
 * `q` is not among them: it is the search, not a filter on it, and it has its
 * own always-visible box. Neither are `sort`, `page` and `pageSize`, which change
 * how one result set is presented rather than which jobs are in it.
 */
export function activeFilters(
  query: SearchQuery,
  label: FilterLabels = DEFAULT_LABELS,
): ActiveFilter[] {
  const filters: ActiveFilter[] = [];

  const each = <T extends string>(
    field:
      | 'technologies'
      | 'locations'
      | 'countryCode'
      | 'workplaceType'
      | 'employmentType'
      | 'juniorLevel',
    values: readonly T[] | undefined,
    text: (value: T) => string,
  ): void => {
    for (const value of values ?? []) {
      const kept = (values ?? []).filter((other) => other !== value);
      filters.push({
        key: `${field}:${value}`,
        label: text(value),
        without: withField(query, field, kept.length > 0 ? kept : undefined),
      });
    }
  };

  const one = (
    field: 'minJuniorScore' | 'maxYearsRequired' | 'postedWithinDays',
    value: number | undefined,
    text: string,
  ): void => {
    if (value !== undefined) {
      filters.push({ key: field, label: text, without: withField(query, field, undefined) });
    }
  };

  each('juniorLevel', query.juniorLevel, label.level);
  each('workplaceType', query.workplaceType, label.workplace);
  each('employmentType', query.employmentType, label.employment);
  each('technologies', query.technologies, (value) => value);
  each('locations', query.locations, (value) => value);
  each('countryCode', query.countryCode, (value) => `Country ${value}`);
  one('minJuniorScore', query.minJuniorScore, `Junior Match ${query.minJuniorScore}+`);
  one(
    'maxYearsRequired',
    query.maxYearsRequired,
    query.maxYearsRequired === 0
      ? 'No experience asked for'
      : `${query.maxYearsRequired} years or fewer`,
  );
  one('postedWithinDays', query.postedWithinDays, postedWithinLabel(query.postedWithinDays));

  return filters;
}

/**
 * How the enum members are worded on a chip. Injected rather than imported so
 * this module stays free of component-layer imports — `shared/enum-labels` and
 * the level labels live beside the components that own that vocabulary, and the
 * search page passes them in.
 */
export interface FilterLabels {
  level: (value: JuniorLevel) => string;
  workplace: (value: WorkplaceType) => string;
  employment: (value: EmploymentType) => string;
}

/** Wire values, so a caller that only wants the count needs no label source. */
const DEFAULT_LABELS: FilterLabels = {
  level: (value) => value,
  workplace: (value) => value,
  employment: (value) => value,
};

/**
 * How many filters are on — the count beside "Filters", and what tells the empty
 * state whether to suggest widening the search or starting one.
 *
 * Defined as the chips' own length so the two can never drift: a filter added to
 * `activeFilters` is counted here without anyone remembering to add it twice.
 */
export function activeFilterCount(query: SearchQuery): number {
  return activeFilters(query).length;
}

function postedWithinLabel(days: number | undefined): string {
  if (days === 1) {
    return 'Last 24 hours';
  }
  return `Last ${days} days`;
}

/**
 * The query with one field replaced, and always back to page one.
 *
 * `undefined` removes the field rather than sending it empty — the same rule
 * `toQueryParams` and `toSearchParams` apply, since `?technologies=` would read
 * as a filter for nothing.
 */
function withField(
  query: SearchQuery,
  field: keyof SearchQuery,
  value: string[] | string | number | undefined,
): SearchQuery {
  const next: SearchQuery = { ...query, page: undefined };
  if (value === undefined) {
    delete next[field];
  } else {
    Object.assign(next, { [field]: value });
  }
  return next;
}

function lowercase(value: string): string {
  return value.toLowerCase();
}

/**
 * One trimmed value, or `undefined` when the parameter is absent or blank — `?q=`
 * is the user having cleared the field, not a search for the empty string.
 *
 * An over-long value is truncated rather than dropped. The cap exists so the
 * backend is never asked to parse an essay; a URL that grew a few characters past
 * it still carries what the user meant, and answering the first 200 characters
 * beats answering nothing.
 */
function text(value: string | null, maxLength: number): string | undefined {
  const trimmed = value?.trim().replace(/\s+/g, ' ') ?? '';
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : undefined;
}

/**
 * Repeated keys become an array. Blanks are dropped, duplicates collapse, and the
 * list is cut at `MAX_FILTER_VALUES`, which the backend rejects a request for
 * exceeding — the entries kept are the first ones, since a URL lists them in the
 * order they were chosen.
 */
function list(
  values: readonly string[],
  maxLength: number,
  map?: (value: string) => string,
): string[] | undefined {
  const kept: string[] = [];

  for (const raw of values) {
    const value = text(raw, maxLength);
    if (value === undefined) {
      continue;
    }
    const mapped = map ? map(value) : value;
    if (!kept.includes(mapped)) {
      kept.push(mapped);
    }
    if (kept.length === MAX_FILTER_VALUES) {
      break;
    }
  }

  return kept.length > 0 ? kept : undefined;
}

/**
 * The entries that are members of a closed vocabulary. Case is folded, because a
 * hand-typed `?workplaceType=remote` means the thing the backend already accepts
 * under that spelling. Anything that is not a member is dropped: a bookmark written
 * by an older build should lose the filter it names, not the search around it.
 */
function members<T extends string>(
  values: readonly string[],
  vocabulary: readonly T[],
): T[] | undefined {
  const kept = (list(values, MAX_TECHNOLOGY_LENGTH, (value) => value.toUpperCase()) ?? []).filter(
    (value): value is T => (vocabulary as readonly string[]).includes(value),
  );

  return kept.length > 0 ? kept : undefined;
}

/**
 * The entries that are two letters, uppercased. A list since M11.12.
 *
 * This is the one parameter that must **not** be truncated to its cap: cutting
 * an alpha-3 code down to two characters turns `AUT` into Australia and `SVN`
 * into El Salvador, so a wrong code is dropped rather than answered
 * confidently. Comma-splitting is allowed here and nowhere among the free-text
 * lists, because a country code cannot contain a comma.
 */
function countryCodes(values: readonly string[]): string[] | undefined {
  const kept: string[] = [];

  for (const raw of values) {
    for (const part of raw.split(',')) {
      const code = part.trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(code) && !kept.includes(code)) {
        kept.push(code);
      }
      if (kept.length === MAX_FILTER_VALUES) {
        return kept;
      }
    }
  }

  return kept.length > 0 ? kept : undefined;
}

/**
 * An integer inside the bounds the API declares, or `undefined`.
 *
 * Out of range is dropped rather than clamped. `?minJuniorScore=900` is not a
 * request for 100, it is a mangled URL, and quietly answering a different question
 * than the address bar shows is worse than answering the unfiltered one.
 */
function integer(value: string | null, min: number, max: number): number | undefined {
  if (value === null || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

function sortOf(value: string | null): SearchSort | undefined {
  // Matched exactly, as the backend matches it: no case fold round-trips
  // `juniorScore`, so a lowercased spelling is a 400 rather than a synonym, and it
  // is dropped here instead of being sent.
  return SEARCH_SORTS.find((candidate) => candidate === value);
}

function digits(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

function put(params: Params, key: string, value: string | readonly string[] | undefined): void {
  if (value !== undefined && (!Array.isArray(value) || value.length > 0)) {
    params[key] = value;
  }
}

/** Drops the keys that came back `undefined`, so the query says only what is set. */
function defined(query: Record<string, unknown>): SearchQuery {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }

  return out as SearchQuery;
}
