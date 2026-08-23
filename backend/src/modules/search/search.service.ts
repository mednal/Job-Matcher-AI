import { Injectable } from '@nestjs/common';
import { PaginatedResponse } from '../../common/dto/paginated.response';
import { JobSummaryResponse } from '../jobs/dto/job-summary.response';
import { SearchQuery, SearchSort } from './dto/search.query';
import { SearchFilters, SearchRepository } from './search.repository';

/**
 * M9.1-M9.3 — the search module's business logic. It owns the request-to-criteria
 * translation and the response shape; it never sees SQL (`SearchRepository`) and
 * never sees Prisma types (`JobSummaryResponse`).
 */
@Injectable()
export class SearchService {
  constructor(private readonly repository: SearchRepository) {}

  async search(
    query: SearchQuery,
  ): Promise<PaginatedResponse<JobSummaryResponse>> {
    const { page, pageSize } = query;

    const { rows, total } = await this.repository.findPage({
      q: normalizeQuery(query.q),
      filters: toFilters(query),
      // The DTO defaults this, but the service is also called directly, so the
      // default cannot live only on the wire contract.
      sort: query.sort ?? SearchSort.RELEVANCE,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const items = rows.map((row) =>
      JobSummaryResponse.fromEntity(row, row.sourceCount),
    );

    return PaginatedResponse.of(items, page, pageSize, total);
  }
}

/**
 * The DTO already trims, but the service is also called from tests and, later,
 * from the profile-fit path (M9.5); "no query" must mean the same thing however
 * the call arrives. Empty is not a search for the empty string.
 */
function normalizeQuery(q: string | undefined): string | null {
  const trimmed = q?.trim() ?? '';
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * The query parameters of §8.1 as the repository's filter shape. The names are
 * identical on both sides so a translation cannot silently swap two facets; all
 * this function does is collapse "absent" and "present but empty" into one
 * answer, because `?technologies=` is a user who selected nothing, not a user who
 * asked for jobs with no technologies.
 */
function toFilters(query: SearchQuery): SearchFilters {
  return {
    technologies: query.technologies ?? [],
    locations: query.locations ?? [],
    countryCode: query.countryCode ?? null,
    workplaceType: query.workplaceType ?? [],
    employmentType: query.employmentType ?? [],
    juniorLevel: query.juniorLevel ?? [],
    minJuniorScore: query.minJuniorScore ?? null,
    maxYearsRequired: query.maxYearsRequired ?? null,
    postedWithinDays: query.postedWithinDays ?? null,
  };
}
