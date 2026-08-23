import { Injectable } from '@nestjs/common';
import { extractExperience, type ExperienceRequirement } from './experience';

/**
 * The experience stage of classification (M8.1, `ARCHITECTURE.md` §6.4).
 *
 * As with the normalization stages, the work itself is pure and lives in
 * `experience.ts`, so it is unit-testable with no database and no container; this
 * class is the injectable seam `RuleBasedClassifier` (M8.3) depends on. It is a
 * service of its own rather than a method on the classifier because the extractor
 * has a second reader coming: M8.4 stores the bounds on `JobClassification` and
 * denormalizes them onto `Job.requiredMinYears` / `requiredMaxYears`, which back the
 * `maxYearsRequired` search parameter.
 */
@Injectable()
export class ExperienceExtractionService {
  /**
   * The numeric experience requirement stated in a normalized description. Both
   * bounds are null when the posting states no figure — a real answer, and the input
   * that makes the classifier fall back to phrase evidence.
   */
  extract(description: string | null | undefined): ExperienceRequirement {
    return extractExperience(description);
  }
}
