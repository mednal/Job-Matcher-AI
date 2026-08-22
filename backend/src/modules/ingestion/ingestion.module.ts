import { Module } from '@nestjs/common';
import { SourcesModule } from '../sources/sources.module';
import { RawIngestionService } from './raw-ingestion.service';
import { StaleRunReaperService } from './stale-run-reaper.service';

/**
 * The orchestrator side of the pipeline (§4.3): `ingestion` depends on `sources`,
 * never the reverse, and no domain module depends on either.
 *
 * M5.3's raw stage only. `IngestionService` — the full fetch → normalize → dedupe →
 * classify → score orchestration — is M5.4 and is blocked on `ARCHITECTURE.md`
 * §14.5; the scheduler and the admin trigger are M5.5.
 */
@Module({
  imports: [SourcesModule],
  providers: [RawIngestionService, StaleRunReaperService],
  exports: [RawIngestionService, StaleRunReaperService],
})
export class IngestionModule {}
