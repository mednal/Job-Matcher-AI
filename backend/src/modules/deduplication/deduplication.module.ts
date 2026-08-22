import { Module } from '@nestjs/common';
import { CanonicalJobService } from './canonical-job.service';
import { PostingIdentityService } from './posting-identity.service';

/**
 * The deduplication stage (`ARCHITECTURE.md` §4.3, §6.3).
 *
 * M7.1 ships tier 1 — source identity, and M7.2 tier 2 — the canonical hash. Tier
 * 3's fuzzy match (M7.3) and merging (M7.4) join them here.
 *
 * Like `normalization`, this module imports no other pipeline module: §4.3 has
 * `ingestion` depending on the stages, never the stages on each other.
 * `IngestionModule` imports it at M5.4, once there is an orchestrator to call it.
 */
@Module({
  providers: [PostingIdentityService, CanonicalJobService],
  exports: [PostingIdentityService, CanonicalJobService],
})
export class DeduplicationModule {}
