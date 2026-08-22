// The one list envelope for the whole API (docs/ARCHITECTURE.md §8):
// { items, page, pageSize, total }. `total` counts the rows the same filter
// matches, not the rows on this page.
export class PaginatedResponse<T> {
  items!: T[];
  page!: number;
  pageSize!: number;
  total!: number;

  static of<T>(
    items: T[],
    page: number,
    pageSize: number,
    total: number,
  ): PaginatedResponse<T> {
    const response = new PaginatedResponse<T>();
    response.items = items;
    response.page = page;
    response.pageSize = pageSize;
    response.total = total;
    return response;
  }
}
