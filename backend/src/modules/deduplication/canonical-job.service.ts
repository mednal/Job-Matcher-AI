import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CanonicalValuesService,
  type CanonicalValueWriter,
} from './canonical-values.service';
import { dedupHash } from './dedup-hash';
import { DEDUP_CLOCK } from './deduplication.tokens';
import { FuzzyMatchService, type FuzzyMatcher } from './fuzzy-match.service';
import { resolveCanonicalId } from './merge-chain';
import { toNormalizedTitle } from './normalized-title';
import type { NormalizedPosting } from './posting-identity.service';

/**
 * M7.2/M7.3 — the clustering tiers (`ARCHITECTURE.md` §6.3).
 *
 * Tier 1 made a posting stable; this service is what attaches it to the canonical
 * `Job` that represents the vacancy, cheapest evidence first:
 *
 * 1. an exact `dedupHash` match — the cheap, certain case (tier 2, M7.2);
 * 2. failing that, one `FuzzyMatcher` pass inside the posting's `companySlug`
 *    (tier 3, M7.3, which owns both thresholds);
 * 3. failing that, a new `Job`, because a false split is the cheaper error.
 *
 * **What neither tier decides.** Neither one chooses the matched `Job`'s displayed
 * values from the posting in hand — inside a tier that is the only candidate in
 * scope, so the last posting of a run would silently win. Once a posting is
 * attached, M7.4's `CanonicalValuesService` re-derives the block from the whole
 * cluster.
 */

export type ClusterOutcome =
  /** An existing `Job` had this `dedupHash`; the posting joined it (tier 2). */
  | 'MATCHED'
  /** No hash matched, but a title and description at this company did (tier 3). */
  | 'FUZZY_MATCHED'
  /** No `Job` had this hash, so one was opened from this posting. */
  | 'CREATED'
  /** The posting already belonged to a cluster; membership was left alone. */
  | 'ALREADY_CLUSTERED';

export interface ClusterAssignment {
  readonly jobId: string;
  readonly outcome: ClusterOutcome;
  /** Stored on the `Job`, because tier 3 matches against it (`DATABASE.md` §3.3). */
  readonly normalizedTitle: string;
  readonly dedupHash: string;
}

/** What tier 2 needs from tier 1's result — the posting row and its current cluster. */
export interface ClusterInput {
  readonly postingId: string;
  /** Whatever tier 1 reported. Non-null means this posting is already clustered. */
  readonly jobId: string | null;
}

@Injectable()
export class CanonicalJobService {
  private readonly logger = new Logger(CanonicalJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(DEDUP_CLOCK)
    private readonly now: () => Date = () => new Date(),
    @Inject(FuzzyMatchService)
    private readonly fuzzy: FuzzyMatcher,
    @Inject(CanonicalValuesService)
    private readonly canonicalValues: CanonicalValueWriter,
  ) {}

  /**
   * Attaches one posting to a canonical `Job`.
   *
   * A posting that already has a `jobId` keeps it, even when its title has changed
   * enough to hash differently. That is the same rule tier 1 states: re-ingestion
   * must not silently undo clustering, and because tier 3 is biased toward
   * splitting, a merge is expensive to redo. Re-clustering an existing posting is a
   * maintenance operation, not something a routine run does.
   */
  async assign(
    posting: NormalizedPosting,
    input: ClusterInput,
  ): Promise<ClusterAssignment> {
    const normalizedTitle = toNormalizedTitle(posting.title);
    if (!normalizedTitle) {
      // Tier 1 rejects an empty title, but a title of pure punctuation survives it
      // and normalizes to nothing. Hashing that would cluster every such posting at
      // a company into one job, so it fails as an item instead.
      throw new Error(
        `Posting ${posting.externalId} has no usable title after normalization ("${posting.title}")`,
      );
    }

    const hash = dedupHash({
      companySlug: posting.companySlug,
      normalizedTitle,
      countryCode: posting.countryCode,
    });

    if (input.jobId) {
      const jobId = await this.touch(input.jobId);
      return {
        jobId,
        outcome: 'ALREADY_CLUSTERED',
        normalizedTitle,
        dedupHash: hash,
      };
    }

    const existing = await this.prisma.job.findUnique({
      where: { dedupHash: hash },
      select: { id: true },
    });
    if (existing) {
      const jobId = await this.attach(input.postingId, existing.id);
      return { jobId, outcome: 'MATCHED', normalizedTitle, dedupHash: hash };
    }

    // No exact hash match, so tier 3 gets its one chance: a trigram pass inside
    // this `companySlug`, confirmed by description. Below either threshold it
    // returns null and falls through to the create, because a false split is the
    // cheaper error (§6.3).
    const fuzzy = await this.fuzzy.findMatch({
      companySlug: posting.companySlug,
      normalizedTitle,
      description: posting.description,
    });
    if (fuzzy) {
      const jobId = await this.attach(input.postingId, fuzzy.jobId);
      this.logger.log(
        `Tier 3 matched "${normalizedTitle}" at ${posting.companySlug} to job ` +
          `${jobId} (title ${fuzzy.titleSimilarity.toFixed(2)}, description ` +
          `${fuzzy.descriptionSimilarity.toFixed(2)})`,
      );
      return {
        jobId,
        outcome: 'FUZZY_MATCHED',
        normalizedTitle,
        dedupHash: hash,
      };
    }

    const created = await this.create(
      posting,
      input.postingId,
      normalizedTitle,
      hash,
    );
    if (created) {
      return {
        jobId: created,
        outcome: 'CREATED',
        normalizedTitle,
        dedupHash: hash,
      };
    }

    // D1: the UNIQUE violation means a concurrent run opened the same job first.
    // That is a race, not an error — retry it as a match against the winner.
    const winner = await this.prisma.job.findUnique({
      where: { dedupHash: hash },
      select: { id: true },
    });
    if (!winner) {
      // The constraint fired but the row is not visible. Not a race this method
      // can resolve, so it fails loudly for the orchestrator's item-level handler
      // rather than leaving the posting unclustered and unreported.
      throw new Error(
        `Job ${hash} conflicted on insert but could not be read back`,
      );
    }

    const jobId = await this.attach(input.postingId, winner.id);
    return { jobId, outcome: 'MATCHED', normalizedTitle, dedupHash: hash };
  }

  /**
   * Points the posting at the canonical job, stamps the job as seen and re-derives
   * its canonical values. Returns the id actually attached to — the end of the
   * merge chain, not necessarily the row that carried the hash.
   */
  private async attach(postingId: string, jobId: string): Promise<string> {
    const canonicalId = await resolveCanonicalId(
      this.prisma,
      jobId,
      this.logger,
    );
    await this.prisma.jobPosting.update({
      where: { id: postingId },
      data: { jobId: canonicalId },
    });
    await this.stamp(canonicalId);
    // The cluster just gained a posting, which may be the richest one in it (M7.4).
    await this.canonicalValues.refresh(canonicalId);
    return canonicalId;
  }

  /**
   * Stamps an already-clustered posting's job, without moving the posting — and
   * refreshes its canonical values anyway, because tier 1 may have rewritten this
   * posting's description on this very run, and a shrunken incumbent should hand
   * the canonical copy to a sibling.
   */
  private async touch(jobId: string): Promise<string> {
    const canonicalId = await resolveCanonicalId(
      this.prisma,
      jobId,
      this.logger,
    );
    await this.stamp(canonicalId);
    await this.canonicalValues.refresh(canonicalId);
    return canonicalId;
  }

  /**
   * `lastSeenAt` and `isActive`, for the same reason tier 1 writes them on the
   * unchanged path: the staleness sweep (M5.6, `DATABASE.md` §8) retires a job by
   * `lastSeenAt`, and a job with a posting in this run has been seen. Leaving it
   * stale would retire every job whose text nobody edits, which is most of them.
   * Canonical field values are untouched here — `attach` and `touch` hand that to
   * `CanonicalValuesService`, which reads the whole cluster rather than one posting.
   */
  private async stamp(jobId: string): Promise<void> {
    await this.prisma.job.update({
      where: { id: jobId },
      data: { lastSeenAt: this.now(), isActive: true },
    });
  }

  /**
   * Opens a canonical job from this posting and attaches it, in one statement so a
   * `Job` can never be left without the posting that created it. Returns null when
   * a concurrent writer won the `dedupHash`.
   */
  private async create(
    posting: NormalizedPosting,
    postingId: string,
    normalizedTitle: string,
    hash: string,
  ): Promise<string | null> {
    const now = this.now();
    try {
      const job = await this.prisma.job.create({
        data: {
          dedupHash: hash,
          title: posting.title,
          normalizedTitle,
          companyName: posting.companyName,
          companySlug: posting.companySlug,
          location: posting.location,
          countryCode: posting.countryCode,
          workplaceType: posting.workplaceType,
          employmentType: posting.employmentType,
          language: posting.language,
          description: posting.description,
          technologies: [...posting.technologies],
          postedAt: posting.postedAt,
          // Non-null by design (`DATABASE.md` §3.3): sorting and pagination need a
          // date on every row, so a source that publishes none falls back to when
          // this system first saw the posting.
          effectivePostedAt: posting.postedAt ?? now,
          firstSeenAt: now,
          lastSeenAt: now,
          isActive: true,
          // The classification block stays null. Phase 8 fills it; a placeholder
          // level here would be indistinguishable from a real verdict in search.
          postings: { connect: { id: postingId } },
        },
        select: { id: true },
      });
      return job.id;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.debug(
          `Insert race on dedupHash for "${normalizedTitle}" (${posting.companySlug}); treating as a match`,
        );
        return null;
      }
      throw error;
    }
  }
}
