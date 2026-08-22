import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  Prisma,
  type EmploymentType,
  type WorkplaceType,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DEDUP_CLOCK } from './deduplication.tokens';
import { postingContentHash } from './posting-content-hash';

/**
 * M7.1 — deduplication tier 1: source identity (`ARCHITECTURE.md` §6.3).
 *
 * The cheapest of the three tiers and the one that absorbs the majority of repeat
 * volume: a source republishes the same listing under the same `externalId` on every
 * run, so `@@unique([sourceId, externalId])` makes re-ingestion an UPDATE rather
 * than a second row.
 *
 * Scope is deliberately one posting at a time. Tier 1 **never touches `jobId`** —
 * clustering postings into a canonical `Job` is tiers 2 and 3 (M7.2/M7.3), and a
 * posting that already belongs to a cluster keeps its membership across re-ingestion
 * rather than being re-clustered from scratch on every run. The orchestrator (M5.4)
 * is what will call this between normalization and tier 2.
 */

/** The normalized posting, as the M6 stages produce it. */
export interface NormalizedPosting {
  readonly sourceId: string;
  readonly externalId: string;
  readonly url: string;
  readonly title: string;
  readonly companyName: string;
  readonly companySlug: string;
  readonly location: string | null;
  readonly countryCode: string | null;
  readonly workplaceType: WorkplaceType | null;
  readonly employmentType: EmploymentType | null;
  /** ISO 639-1, from `LanguageDetectionService` — always `en` or `de`. */
  readonly language: string;
  /** Normalized plain text, not source markup. */
  readonly description: string;
  readonly technologies: readonly string[];
  readonly postedAt: Date | null;
}

export type PostingUpsertOutcome = 'CREATED' | 'UPDATED' | 'UNCHANGED';

export interface PostingUpsertResult {
  readonly postingId: string;
  /**
   * `UNCHANGED` means no column other than `lastSeenAt` would have changed — the
   * signal M5.4 needs to skip re-classifying a posting nobody edited. `UPDATED`
   * covers a content change *and* a reactivation, because both write a column.
   */
  readonly outcome: PostingUpsertOutcome;
  /** Whatever tier 2/3 last set. Tier 1 reports it; it never assigns it. */
  readonly jobId: string | null;
  readonly contentHash: string;
}

@Injectable()
export class PostingIdentityService {
  private readonly logger = new Logger(PostingIdentityService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(DEDUP_CLOCK)
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Writes one posting, keyed by `(sourceId, externalId)`.
   *
   * `lastSeenAt` is written on every call, including `UNCHANGED` — the staleness
   * sweep (M5.6, `DATABASE.md` §8) deactivates postings a source stopped listing,
   * and a posting that was fetched again has been listed, whether or not its text
   * moved. Leaving it stale on the unchanged path would retire every posting that
   * never gets edited, which is most of them.
   */
  async upsert(posting: NormalizedPosting): Promise<PostingUpsertResult> {
    this.assertIdentifiable(posting);

    const contentHash = postingContentHash(posting);
    const existing = await this.findExisting(posting);

    if (!existing) {
      const created = await this.create(posting, contentHash);
      if (created) {
        return created;
      }
      // Lost an insert race — the row exists now, so fall through and update it.
      // Re-read rather than assuming: the winner's values are what we are updating
      // from, and they are not necessarily ours.
      const raced = await this.findExisting(posting);
      if (!raced) {
        // The unique constraint fired but the row is not visible. That is not a
        // race this method can resolve, so it fails loudly for the item-level
        // handler rather than silently dropping the posting.
        throw new Error(
          `Posting (${posting.sourceId}, ${posting.externalId}) conflicted on insert but could not be read back`,
        );
      }
      return this.update(raced, posting, contentHash);
    }

    return this.update(existing, posting, contentHash);
  }

  private async findExisting(posting: NormalizedPosting) {
    return this.prisma.jobPosting.findUnique({
      where: {
        sourceId_externalId: {
          sourceId: posting.sourceId,
          externalId: posting.externalId,
        },
      },
      select: { id: true, contentHash: true, isActive: true, jobId: true },
    });
  }

  /** Returns null when another writer inserted the same identity first. */
  private async create(
    posting: NormalizedPosting,
    contentHash: string,
  ): Promise<PostingUpsertResult | null> {
    const now = this.now();
    try {
      const row = await this.prisma.jobPosting.create({
        data: {
          ...this.writableColumns(posting),
          sourceId: posting.sourceId,
          externalId: posting.externalId,
          contentHash,
          // Both stamped explicitly, from one clock reading, so a new posting's
          // `firstSeenAt` and `lastSeenAt` are equal rather than microseconds apart.
          firstSeenAt: now,
          lastSeenAt: now,
          isActive: true,
        },
        select: { id: true, jobId: true },
      });
      return {
        postingId: row.id,
        outcome: 'CREATED',
        jobId: row.jobId,
        contentHash,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.debug(
          `Insert race on (${posting.sourceId}, ${posting.externalId}); treating as an update`,
        );
        return null;
      }
      throw error;
    }
  }

  private async update(
    existing: {
      id: string;
      contentHash: string;
      isActive: boolean;
      jobId: string | null;
    },
    posting: NormalizedPosting,
    contentHash: string,
  ): Promise<PostingUpsertResult> {
    const now = this.now();

    // A posting the source is listing again is live again, whatever a previous
    // staleness sweep concluded. Reactivation is a column change, so it is reported
    // as UPDATED even when the text is identical.
    const unchanged = existing.contentHash === contentHash && existing.isActive;

    const row = await this.prisma.jobPosting.update({
      where: { id: existing.id },
      data: unchanged
        ? { lastSeenAt: now }
        : {
            ...this.writableColumns(posting),
            contentHash,
            lastSeenAt: now,
            isActive: true,
          },
      select: { id: true, jobId: true },
    });

    return {
      postingId: row.id,
      outcome: unchanged ? 'UNCHANGED' : 'UPDATED',
      jobId: row.jobId,
      contentHash,
    };
  }

  /**
   * The columns a re-ingestion may overwrite. `jobId`, `firstSeenAt` and the
   * identity pair are absent by design: the first belongs to tiers 2/3, the second
   * records when this system first saw the posting and must survive every later
   * run, and the third is the key being matched on.
   */
  private writableColumns(posting: NormalizedPosting) {
    return {
      url: posting.url,
      title: posting.title,
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
    };
  }

  /**
   * Tier 1 is identity matching, so an unusable identity is the one thing it cannot
   * work around: a blank `externalId` would collapse every posting of a source onto
   * a single row through the very unique constraint this tier relies on. Thrown
   * rather than returned, so it lands in the orchestrator's item-level handler and
   * is counted as a failure instead of being written.
   */
  private assertIdentifiable(posting: NormalizedPosting): void {
    if (!posting.sourceId) {
      throw new Error('NormalizedPosting has no sourceId');
    }
    if (!posting.externalId) {
      throw new Error('NormalizedPosting has no externalId');
    }
    if (!posting.url) {
      throw new Error(
        `Posting ${posting.externalId} has no url; the job detail page could not link to it`,
      );
    }
    if (!posting.title || !posting.companySlug) {
      throw new Error(
        `Posting ${posting.externalId} has no title or company slug; tiers 2 and 3 would have nothing to match on`,
      );
    }
  }
}
