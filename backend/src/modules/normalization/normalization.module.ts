import { Module } from '@nestjs/common';
import { CompanyLocationService } from './company-location.service';
import { JobAttributesService } from './job-attributes.service';
import { LanguageDetectionService } from './language-detection.service';
import { TextNormalizationService } from './text-normalization.service';

/**
 * The normalization stage (`ARCHITECTURE.md` §4.3, §6.2).
 *
 * M6.1 shipped the text stage, M6.2 company and location, M6.3 the
 * classification-relevant attributes and M6.4 language detection, which closes the
 * phase. `IngestionModule` imports the finished module at M5.4 — which, per the
 * sequencing decision in `MILESTONES.md`, runs after this phase precisely so that
 * there is a real stage to wire in rather than a stub.
 *
 * The module depends on nothing: normalization is pure text work, and it must never
 * import `sources/` (§4.2).
 */
@Module({
  providers: [
    TextNormalizationService,
    CompanyLocationService,
    JobAttributesService,
    LanguageDetectionService,
  ],
  exports: [
    TextNormalizationService,
    CompanyLocationService,
    JobAttributesService,
    LanguageDetectionService,
  ],
})
export class NormalizationModule {}
