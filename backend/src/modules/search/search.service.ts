import { Injectable } from '@nestjs/common';
import type { Profile } from '@prisma/client';
import { PaginatedResponse } from '../../common/dto/paginated.response';
import { JobSummaryResponse } from '../jobs/dto/job-summary.response';
import { ProfilesService } from '../profiles/profiles.service';
import { SearchQuery, SearchSort } from './dto/search.query';
import {
  ProfileFit,
  SearchFilters,
  SearchRepository,
} from './search.repository';

/**
 * M9.1-M9.5 — the search module's business logic. It owns the request-to-criteria
 * translation and the response shape; it never sees SQL (`SearchRepository`) and
 * never sees Prisma types beyond the `Profile` row it immediately reduces to a
 * `ProfileFit` (`JobSummaryResponse` is what leaves this service).
 *
 * The dependency on `profiles/` is the one `docs/ARCHITECTURE.md` §6.5 calls for:
 * personalization is applied at query time in the search module, and
 * `ProfilesService` is the only place `prisma.profile` is touched (§4.2). Reading
 * the table directly from here would give that row a second owner.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly repository: SearchRepository,
    private readonly profiles: ProfilesService,
  ) {}

  /**
   * `userId` is the authenticated caller, or `undefined` for an anonymous request
   * — `/jobs/search` is readable without a token (`docs/ARCHITECTURE.md` §8) and
   * that has to stay true, so every profile-dependent step is skipped rather than
   * defaulted.
   */
  async search(
    query: SearchQuery,
    userId?: string,
  ): Promise<PaginatedResponse<JobSummaryResponse>> {
    const { page, pageSize } = query;
    // The DTO defaults this, but the service is also called directly, so the
    // default cannot live only on the wire contract.
    const sort = query.sort ?? SearchSort.RELEVANCE;

    const { rows, total } = await this.repository.findPage({
      q: normalizeQuery(query.q),
      filters: toFilters(query),
      sort,
      profile: await this.profileFit(userId, sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const items = rows.map((row) =>
      JobSummaryResponse.fromEntity(row, row.sourceCount),
    );

    return PaginatedResponse.of(items, page, pageSize, total);
  }

  /**
   * The caller's saved preferences, or `null` when there is nothing to rank by.
   *
   * The profile is not read at all unless it can change the answer: an anonymous
   * request has none, and `sort=juniorScore` / `sort=postedAt` are orderings the
   * caller named outright, which profile fit must not perturb. Skipping the query
   * is the same result as fetching it and ignoring it, one round trip cheaper.
   */
  private async profileFit(
    userId: string | undefined,
    sort: SearchSort,
  ): Promise<ProfileFit | null> {
    if (userId === undefined || sort !== SearchSort.RELEVANCE) {
      return null;
    }

    const profile = await this.profiles.findByUserId(userId);
    return profile === null ? null : toProfileFit(profile);
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
    countryCode: query.countryCode ?? [],
    workplaceType: query.workplaceType ?? [],
    employmentType: query.employmentType ?? [],
    juniorLevel: query.juniorLevel ?? [],
    minJuniorScore: query.minJuniorScore ?? null,
    maxYearsRequired: query.maxYearsRequired ?? null,
    postedWithinDays: query.postedWithinDays ?? null,
  };
}

/**
 * A stored profile as the things ranking uses (`docs/ARCHITECTURE.md` §6.5).
 *
 * A profile that says none of them becomes `null`, not an empty fit: a
 * registered user who has never filled anything in must be ranked exactly like
 * an anonymous one, and `null` is the single condition the repository tests for
 * that.
 *
 * **Zero years is passed as `null`, not as `0`** (M11.12). `yearsOfExperience`
 * is non-null and defaults to 0, so it is the one field that holds a value for
 * a profile that never mentioned it — reading it literally would give every
 * untouched profile a ranking term its owner never asked for. At zero years the
 * term would also restate what `juniorScore` already contributes with a much
 * larger share. It earns its place above zero, where it says something new: a
 * candidate with two years can reach a posting asking for three, and the junior
 * score alone ranks that posting away from them.
 *
 * `desiredRoles` is still deliberately unread — it is free text that would need
 * the text query's stemming to mean anything, and weighting it is M12.3's.
 *
 * The values are already canonical: M3.6 writes technologies as slugs and country
 * codes as uppercase alpha-2 at write time, precisely so a read-time comparison
 * cannot silently match nothing.
 */
function toProfileFit(profile: Profile): ProfileFit | null {
  const fit: ProfileFit = {
    technologies: profile.technologies,
    locations: profile.locations,
    countryCodes: profile.countryCodes,
    yearsOfExperience:
      profile.yearsOfExperience > 0 ? profile.yearsOfExperience : null,
  };

  const isEmpty =
    fit.technologies.length === 0 &&
    fit.locations.length === 0 &&
    fit.countryCodes.length === 0 &&
    fit.yearsOfExperience === null;

  return isEmpty ? null : fit;
}
