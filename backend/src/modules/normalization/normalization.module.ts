import { Module } from '@nestjs/common';
import { CompanyLocationService } from './company-location.service';
import { TextNormalizationService } from './text-normalization.service';

/**
 * The normalization stage (`ARCHITECTURE.md` §4.3, §6.2).
 *
 * M6.1 shipped the text stage; M6.2 adds company and location. The
 * classification-relevant attributes (M6.3) and language detection (M6.4) join
 * them here, and `IngestionModule` imports the finished module at M5.4 — which,
 * per the sequencing decision in `MILESTONES.md`, runs after this phase precisely
 * so that there is a real stage to wire in rather than a stub.
 *
 * The module depends on nothing: normalization is pure text work, and it must never
 * import `sources/` (§4.2).
 */
@Module({
  providers: [TextNormalizationService, CompanyLocationService],
  exports: [TextNormalizationService, CompanyLocationService],
})
export class NormalizationModule {}
