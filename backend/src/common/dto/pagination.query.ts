import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// Offset pagination, shared by every list endpoint (docs/ARCHITECTURE.md §8.1).
// The cap is a contract, not a suggestion: without it a client can ask for the
// whole table in one query.
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

/**
 * `page` is bounded too, which is less obvious than bounding `pageSize` but not
 * optional.
 *
 * Without it `?page=1e20` passes validation — `Number.isInteger(1e20)` is `true`
 * — and becomes an `OFFSET` beyond what PostgreSQL's `bigint` can hold, so the
 * request dies inside the driver and the client gets a **500 for input the API
 * should have refused**. That was a real response from `/jobs/search` and
 * `/jobs` before this bound existed.
 *
 * 200 pages at `MAX_PAGE_SIZE` is 10 000 results deep. Past that, offset
 * pagination is the wrong instrument — every page costs the database the whole
 * offset again — and, per `PRODUCT.md` §8, someone reading result 10 000 does not
 * need a deeper page, they need a narrower search.
 */
export const MAX_PAGE = 200;

export class PaginationQuery {
  // @Type is required because query strings arrive as strings; without it
  // @IsInt rejects every request. NaN (e.g. ?page=abc) fails @IsInt → 400.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;
}
