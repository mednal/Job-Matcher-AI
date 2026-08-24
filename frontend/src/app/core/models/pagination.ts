/**
 * The one list envelope the whole API uses (`docs/ARCHITECTURE.md` §8):
 * `{ items, page, pageSize, total }`. `total` counts every row the filter
 * matches, not the rows on this page.
 */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Mirrors `backend/src/common/dto/pagination.query.ts`. */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
export const MAX_PAGE = 200;

export interface PageRequest {
  page?: number;
  pageSize?: number;
}
