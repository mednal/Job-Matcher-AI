import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { dedupHash } from './dedup-hash';
import { DEDUP_CLOCK } from './deduplication.tokens';
import { toNormalizedTitle } from './normalized-title';
import type { NormalizedPosting } from './posting-identity.service';

/**
 * M7.2 — deduplication tier 2: the canonical hash (`ARCHITECTURE.md` §6.3).
 *
 * Tier 1 made a posting stable; tier 2 is the first tier that clusters, attaching a
 * posting to the canonical `Job` that represents the vacancy. It matches on an
 * exact `dedupHash` — the cheap, certain case — and creates the `Job` when nothing
 * matches.
 *
 * **Where tier 3 will slot in.** M7.3's fuzzy match belongs between the failed hash
 * lookup and the create in `assign` below: an unmatched posting gets one trigram
 * pass within its `companySlug` before a new `Job` is opened. The seam is marked in
 * the code. Tier 3 is deliberately absent here rather than stubbed.
 *
 * **What tier 2 does not do.** It never rewrites a matched `Job`'s canonical field
 * values. Choosing those from the posting with the richest description is M7.4, and
 * guessing at it now would mean the last posting of a run silently won.
 */

const MAX_MERGE_HOPS = 10;

export type ClusterOutcome =
  /** An existing `Job` had this `dedupHash`; the posting joined it. */
  | 'MATCHED'
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

    // ── M7.3 slots in here ──────────────────────────────────────────────────
    // No exact hash match. Tier 3 gets its one chance to find a fuzzy candidate
    // within this `companySlug` before a new canonical job is opened; below the
    // threshold it falls through to the create, because a false split is the
    // cheaper error (§6.3).

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
   * Points the posting at the canonical job and stamps the job as seen.
   * Returns the id actually attached to — the end of the merge chain, not
   * necessarily the row that carried the hash.
   */
  private async attach(postingId: string, jobId: string): Promise<string> {
    const canonicalId = await this.resolveCanonicalId(jobId);
    await this.prisma.jobPosting.update({
      where: { id: postingId },
      data: { jobId: canonicalId },
    });
    await this.stamp(canonicalId);
    return canonicalId;
  }

  /** Stamps an already-clustered posting's job, without moving the posting. */
  private async touch(jobId: string): Promise<string> {
    const canonicalId = await this.resolveCanonicalId(jobId);
    await this.stamp(canonicalId);
    return canonicalId;
  }

  /**
   * `lastSeenAt` and `isActive`, for the same reason tier 1 writes them on the
   * unchanged path: the staleness sweep (M5.6, `DATABASE.md` §8) retires a job by
   * `lastSeenAt`, and a job with a posting in this run has been seen. Leaving it
   * stale would retire every job whose text nobody edits, which is most of them.
   * Canonical field values are untouched — those are M7.4's.
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

  /**
   * Walks `mergedIntoJobId` to the end of the chain, so a posting joins the
   * surviving job rather than a tombstone (D2). Mirrors `JobsService`, but ends
   * differently: the read side 404s on a broken chain, while ingestion has a
   * posting in hand and must put it somewhere, so it stops at the last row it could
   * read and logs loudly.
   */
  private async resolveCanonicalId(id: string): Promise<string> {
    const visited = new Set<string>();
    let currentId = id;

    for (let hop = 0; hop <= MAX_MERGE_HOPS; hop++) {
      if (visited.has(currentId)) {
        this.logger.error(
          `Merge cycle detected while clustering into job ${id} (at ${currentId})`,
        );
        return currentId;
      }
      visited.add(currentId);

      const row = await this.prisma.job.findUnique({
        where: { id: currentId },
        select: { id: true, mergedIntoJobId: true },
      });
      if (!row) {
        return currentId;
      }
      if (!row.mergedIntoJobId) {
        return row.id;
      }
      currentId = row.mergedIntoJobId;
    }

    this.logger.error(
      `Merge chain for job ${id} exceeded ${MAX_MERGE_HOPS} hops`,
    );
    return currentId;
  }
}
