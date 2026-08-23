import { Module } from '@nestjs/common';
import { ClassificationModule } from '../classification/classification.module';
import { DeduplicationModule } from '../deduplication/deduplication.module';
import { NormalizationModule } from '../normalization/normalization.module';
import { SourcesModule } from '../sources/sources.module';
import { IngestionService } from './ingestion.service';
import { JOB_PIPELINE } from './ingestion.tokens';
import { JobPipelineService } from './job-pipeline.service';
import { RawIngestionService } from './raw-ingestion.service';
import { StaleRunReaperService } from './stale-run-reaper.service';

/**
 * The orchestrator side of the pipeline (§4.3): `ingestion` depends on `sources` and
 * on every stage module, never the reverse, and no domain module depends on any of
 * them. This is the one place the arrows converge, which is why the graph stays a
 * tree — the stages have never heard of each other.
 *
 * M5.3 shipped the raw stage. M5.4 completes the pipeline: `JobPipelineService`
 * chains normalize → dedupe → classify → score for one posting, `RawIngestionService`
 * reaches it through the `JOB_PIPELINE` seam, and `IngestionService` resolves the
 * ingestion plan and isolates one source's failure from the next. The scheduler and
 * the admin trigger are M5.5, and the retention sweep M5.6.
 */
@Module({
  imports: [
    SourcesModule,
    NormalizationModule,
    DeduplicationModule,
    ClassificationModule,
  ],
  providers: [
    RawIngestionService,
    StaleRunReaperService,
    JobPipelineService,
    IngestionService,
    {
      // Bound here rather than injected directly by `RawIngestionService`, so the
      // run engine keeps compiling and passing its M5.3 specs with no stage module
      // present at all. The token is the seam; this line is the only thing that
      // decides a run does more than store payloads.
      provide: JOB_PIPELINE,
      useExisting: JobPipelineService,
    },
  ],
  exports: [
    IngestionService,
    RawIngestionService,
    StaleRunReaperService,
    JobPipelineService,
  ],
})
export class IngestionModule {}
