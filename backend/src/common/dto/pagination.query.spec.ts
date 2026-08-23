// PaginationQuery uses @Type, which reads design-time metadata; the Nest runtime
// loads this in main.ts, a bare Jest run does not.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE,
  MAX_PAGE_SIZE,
  PaginationQuery,
} from './pagination.query';

function parse(query: Record<string, unknown>): PaginationQuery {
  return plainToInstance(PaginationQuery, query, {
    enableImplicitConversion: false,
  });
}

function errorsFor(query: Record<string, unknown>): string[] {
  return validateSync(parse(query), {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).map((error) => error.property);
}

/**
 * The envelope's query half, shared by `GET /jobs` and `GET /jobs/search`
 * (`docs/ARCHITECTURE.md` §8.1). It is specced here rather than in either module
 * because a change to it changes both, and because both bounds exist to stop a
 * request the database should never be asked to run.
 */
describe('PaginationQuery', () => {
  it('defaults to the first page at the shared page size', () => {
    const parsed = parse({});

    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it('parses the numbers a query string delivers as strings', () => {
    const parsed = parse({ page: '3', pageSize: '50' });

    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(50);
  });

  it('accepts both bounds at their limit', () => {
    expect(errorsFor({ page: MAX_PAGE, pageSize: MAX_PAGE_SIZE })).toEqual([]);
  });

  it('rejects a page size past the cap', () => {
    expect(errorsFor({ pageSize: MAX_PAGE_SIZE + 1 })).toEqual(['pageSize']);
  });

  it.each([0, -1, 1.5, 'abc', ''])('rejects page = %s', (page) => {
    expect(errorsFor({ page })).toEqual(['page']);
  });

  it.each([0, -1, 1.5, 'abc'])('rejects pageSize = %s', (pageSize) => {
    expect(errorsFor({ pageSize })).toEqual(['pageSize']);
  });

  /**
   * The reason `page` is bounded at all. `Number.isInteger(1e20)` is `true`, so
   * without @Max these pass validation and become an `OFFSET` past what
   * PostgreSQL's `bigint` holds — the request then fails inside the driver and
   * the client gets a 500 for input the API should have refused.
   */
  it.each([MAX_PAGE + 1, 1e20, Number.MAX_SAFE_INTEGER])(
    'rejects page = %s rather than turning it into an unrunnable OFFSET',
    (page) => {
      expect(errorsFor({ page })).toEqual(['page']);
    },
  );

  // The deepest page the API will serve, and the offset it costs.
  it('bounds the reachable offset', () => {
    const parsed = parse({ page: MAX_PAGE, pageSize: MAX_PAGE_SIZE });
    const offset = (parsed.page - 1) * parsed.pageSize;

    expect(offset).toBe(9950);
    expect(Number.isSafeInteger(offset)).toBe(true);
  });
});
