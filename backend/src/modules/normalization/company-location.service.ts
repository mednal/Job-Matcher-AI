import { Injectable } from '@nestjs/common';
import { toCompanySlug } from './company-slug';
import { parseLocation, type ParsedLocation } from './location';

/**
 * The company and location stage of normalization (M6.2, `ARCHITECTURE.md` §6.2).
 *
 * Like the text stage, the work itself is pure and lives in `company-slug.ts` and
 * `location.ts`, so it is unit-testable with no database, as §6 requires of every
 * pipeline stage. This class is the injectable seam the orchestrator (M5.4) and
 * deduplication (Phase 7) depend on.
 */
@Injectable()
export class CompanyLocationService {
  /**
   * The dedup partition key for a company name. `''` when the source gave no
   * company — the caller decides what a posting without an employer means, since
   * this stage has no way to invent one.
   */
  toCompanySlug(companyName: string | null | undefined): string {
    return toCompanySlug(companyName);
  }

  /** A free-text location as a display value plus an ISO alpha-2 country code. */
  parseLocation(location: string | null | undefined): ParsedLocation {
    return parseLocation(location);
  }
}
