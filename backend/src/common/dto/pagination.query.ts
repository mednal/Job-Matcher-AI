import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// Offset pagination, shared by every list endpoint (docs/ARCHITECTURE.md §8.1).
// The cap is a contract, not a suggestion: without it a client can ask for the
// whole table in one query.
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export class PaginationQuery {
  // @Type is required because query strings arrive as strings; without it
  // @IsInt rejects every request. NaN (e.g. ?page=abc) fails @IsInt → 400.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;
}
