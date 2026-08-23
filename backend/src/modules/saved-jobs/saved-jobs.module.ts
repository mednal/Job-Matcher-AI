import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { SavedJobsController } from './saved-jobs.controller';
import { SavedJobsService } from './saved-jobs.service';

// The user's own collection over the canonical job model. Like `jobs/` and
// `search/` it only reads the tables ingestion writes, and never depends on
// `sources/` or the pipeline modules (`docs/ARCHITECTURE.md` §4.3).
//
// `JobsModule` is imported for the job-exists check on `POST`: `prisma.job` has
// one owner, and this module is not it.
@Module({
  imports: [JobsModule],
  controllers: [SavedJobsController],
  providers: [SavedJobsService],
  exports: [SavedJobsService],
})
export class SavedJobsModule {}
