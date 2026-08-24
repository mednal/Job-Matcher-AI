import { HttpParams } from '@angular/common/http';
import { SearchQuery } from '../models/search';
import { PageRequest } from '../models/pagination';

/**
 * Serializes a `SearchQuery` into the query string `GET /jobs/search` expects.
 *
 * Two rules the backend makes non-negotiable:
 *
 * - **Lists become repeated keys** (`?technologies=java&technologies=kotlin`).
 *   The backend also accepts commas for slugs and enums, but never for
 *   `locations`, where "Berlin, Germany" is one plausible value. Repeating the
 *   key is the one form that is correct for every parameter, so it is the only
 *   form used.
 * - **Empty means absent.** The backend runs `forbidNonWhitelisted`, so an
 *   unknown parameter is a 400 — but a *declared* parameter sent empty is worse
 *   than a 400: `?q=` and `?technologies=` would read as filters and are
 *   silently dropped here instead, which is what "the user cleared the field"
 *   means.
 *
 * `sort` is included only when set, so the backend's own default (`relevance`)
 * stays the single definition of it.
 */
export function toSearchParams(query: SearchQuery): HttpParams {
  let params = toPageParams(query);

  params = appendText(params, 'q', query.q);
  params = appendText(params, 'countryCode', query.countryCode);
  params = appendList(params, 'technologies', query.technologies);
  params = appendList(params, 'locations', query.locations);
  params = appendList(params, 'workplaceType', query.workplaceType);
  params = appendList(params, 'employmentType', query.employmentType);
  params = appendList(params, 'juniorLevel', query.juniorLevel);
  params = appendNumber(params, 'minJuniorScore', query.minJuniorScore);
  params = appendNumber(params, 'maxYearsRequired', query.maxYearsRequired);
  params = appendNumber(params, 'postedWithinDays', query.postedWithinDays);
  params = appendText(params, 'sort', query.sort);

  return params;
}

/** Pagination for the plain list endpoints, which take nothing else. */
export function toPageParams(page: PageRequest): HttpParams {
  let params = new HttpParams();
  params = appendNumber(params, 'page', page.page);
  params = appendNumber(params, 'pageSize', page.pageSize);
  return params;
}

function appendText(params: HttpParams, key: string, value: string | undefined): HttpParams {
  const trimmed = value?.trim();
  return trimmed ? params.append(key, trimmed) : params;
}

function appendList(
  params: HttpParams,
  key: string,
  values: readonly string[] | undefined,
): HttpParams {
  if (!values) {
    return params;
  }
  return values.reduce((accumulated, value) => appendText(accumulated, key, value), params);
}

// `0` is a meaningful value for `minJuniorScore` and `maxYearsRequired`, so the
// test is against `undefined` and not against falsiness. NaN is dropped rather
// than sent, because `?page=NaN` is a 400 the user cannot act on.
function appendNumber(params: HttpParams, key: string, value: number | undefined): HttpParams {
  if (value === undefined || !Number.isFinite(value)) {
    return params;
  }
  return params.append(key, String(value));
}
