import { Injectable } from '@nestjs/common';
import type { EmploymentType, WorkplaceType } from '@prisma/client';
import { detectEmploymentType } from './employment-type';
import { extractTechnologies } from './technologies';
import { detectWorkplaceType } from './workplace-type';

/**
 * The classification-relevant attributes stage of normalization (M6.3,
 * `ARCHITECTURE.md` §6.2).
 *
 * "Classification-relevant" is the point of the grouping: none of these three fields
 * is the junior classification itself (Phase 8 owns that), but each one changes how
 * a posting is read. Employment type separates the internship and working-student
 * postings that are the most junior-suitable roles on the board; workplace type
 * decides whether a candidate can take the job at all; technologies drive both the
 * search facet and profile-fit ranking.
 *
 * As with the other stages, the work is pure and lives in the sibling modules, so it
 * is unit-testable with no database (§6). This class is the injectable seam the
 * orchestrator (M5.4) depends on.
 */
@Injectable()
export class JobAttributesService {
  /** REMOTE / HYBRID / ONSITE, or null when the posting states nothing. */
  detectWorkplaceType(input: {
    title?: string | null;
    location?: string | null;
    description?: string | null;
    declared?: WorkplaceType | null;
  }): WorkplaceType | null {
    return detectWorkplaceType(input);
  }

  /** The employment arrangement, or null when the posting states none. */
  detectEmploymentType(input: {
    title?: string | null;
    description?: string | null;
    declared?: EmploymentType | null;
  }): EmploymentType | null {
    return detectEmploymentType(input);
  }

  /**
   * Canonical technology slugs for `JobPosting.technologies`. Title and description
   * are both scanned: "Junior Java Developer" is often the only place the stack is
   * named.
   */
  extractTechnologies(
    title?: string | null,
    description?: string | null,
  ): string[] {
    return extractTechnologies(title, description);
  }
}
