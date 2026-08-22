import { Module } from '@nestjs/common';
import { CanonicalJobService } from './canonical-job.service';
import { CanonicalValuesService } from './canonical-values.service';
import { FuzzyMatchService } from './fuzzy-match.service';
import { JobMergeService } from './job-merge.service';
import { PostingIdentityService } from './posting-identity.service';

/**
 * The deduplication stage (`ARCHITECTURE.md` §4.3, §6.3).
 *
 * M7.1 ships tier 1 — source identity; M7.2 tier 2 — the canonical hash; M7.3 tier
 * 3 — the fuzzy match, which `CanonicalJobService` reaches through the
 * `FuzzyMatcher` seam. M7.4 adds the two halves of merging: `CanonicalValuesService`
 * decides which posting a cluster displays, and `JobMergeService` folds one `Job`
 * into another behind a `mergedIntoJobId` redirect.
 *
 * Like `normalization`, this module imports no other pipeline module: §4.3 has
 * `ingestion` depending on the stages, never the stages on each other.
 * `IngestionModule` imports it at M5.4, once there is an orchestrator to call it.
 */
@Module({
  providers: [
    PostingIdentityService,
    FuzzyMatchService,
    CanonicalValuesService,
    CanonicalJobService,
    JobMergeService,
  ],
  exports: [
    PostingIdentityService,
    FuzzyMatchService,
    CanonicalValuesService,
    CanonicalJobService,
    JobMergeService,
  ],
})
export class DeduplicationModule {}
