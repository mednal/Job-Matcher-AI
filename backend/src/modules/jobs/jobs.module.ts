import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

// The read side of the canonical job model. It reads the tables the ingestion
// pipeline writes and never depends on `sources/` or on the pipeline modules
// (docs/ARCHITECTURE.md §4.3).
@Module({
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
