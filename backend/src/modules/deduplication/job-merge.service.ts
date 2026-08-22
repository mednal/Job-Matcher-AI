import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CanonicalValuesService } from './canonical-values.service';
import { resolveCanonicalId } from './merge-chain';

/**
 * M7.4 — merging two canonical jobs (`ARCHITECTURE.md` §6.3, D2).
 *
 * Tier 3 is biased toward splitting: below either threshold it opens a new `Job`,
 * because a false split shows one vacancy twice while a false merge **hides a real
 * vacancy from the user**. That bias is only defensible if the splits it produces
 * stay correctable, and this is the correction.
 *
 * The loser is never deleted. It keeps its id and gains `mergedIntoJobId`, so:
 *
 * - search skips it (`mergedIntoJobId IS NULL`, D2 and `DATABASE.md` §5);
 * - a `SavedJob` pointing at it still resolves, through the redirect `JobsService`
 *   already walks (M4.1) — the whole reason D2 chose a tombstone over a delete;
 * - tier 2 still finds it by `dedupHash` and follows the redirect to the survivor,
 *   so postings that used to land on the loser now land on the winner.
 *
 * **Nothing calls this automatically.** Merging is a correction, not a stage: the
 * pipeline splits, a human decides two jobs are one. There is no admin surface yet
 * (D4; the first admin route is M5.5), so this is a service method exercised by
 * tests. Wiring it to an endpoint is a later, explicit task.
 */

export type MergeOutcome =
  /** The loser was redirected to the winner and its postings moved. */
  | 'MERGED'
  /** Both ids already resolved to the same surviving job; nothing was written. */
  | 'ALREADY_MERGED';

export interface MergeResult {
  /** The surviving job — the end of the winner's own merge chain. */
  readonly winnerId: string;
  /** The row that gained the redirect, or the shared survivor on a no-op. */
  readonly loserId: string;
  readonly outcome: MergeOutcome;
  readonly movedPostings: number;
  /** Tombstones that pointed at the loser and were re-pointed at the winner. */
  readonly repointedRedirects: number;
}

@Injectable()
export class JobMergeService {
  private readonly logger = new Logger(JobMergeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly canonicalValues: CanonicalValuesService,
  ) {}

  /**
   * Merges `loserId` into `winnerId`.
   *
   * Both ids are resolved through their own merge chains first, so merging into a
   * job that was itself merged away lands on the survivor rather than extending a
   * chain. If they resolve to the same row the call is a no-op — which makes
   * merging idempotent, and means a second attempt after a partial failure is safe.
   *
   * Throws when either id does not exist: a merge names two specific vacancies, and
   * silently doing nothing about a typo would leave the split in place while
   * reporting success.
   */
  async merge(loserId: string, winnerId: string): Promise<MergeResult> {
    await this.assertExists(loserId);
    await this.assertExists(winnerId);

    const loser = await resolveCanonicalId(this.prisma, loserId, this.logger);
    const winner = await resolveCanonicalId(this.prisma, winnerId, this.logger);

    if (loser === winner) {
      return {
        winnerId: winner,
        loserId: loser,
        outcome: 'ALREADY_MERGED',
        movedPostings: 0,
        repointedRedirects: 0,
      };
    }

    // A cycle is unreachable here rather than guarded against: `winner` is the end
    // of its own chain, so it points at nothing, and pointing the loser at it
    // cannot close a loop.
    const { movedPostings, repointedRedirects } =
      await this.prisma.$transaction(async (tx) => {
        const postings = await tx.jobPosting.updateMany({
          where: { jobId: loser },
          data: { jobId: winner },
        });

        // Tombstones already pointing at the loser are re-pointed at the winner
        // rather than left to chain through it. The walk would find the survivor
        // either way, but every merge would make the chain one hop longer, and
        // `MAX_MERGE_HOPS` is finite.
        const redirects = await tx.job.updateMany({
          where: { mergedIntoJobId: loser },
          data: { mergedIntoJobId: winner },
        });

        await tx.job.update({
          where: { id: loser },
          data: { mergedIntoJobId: winner },
        });

        return {
          movedPostings: postings.count,
          repointedRedirects: redirects.count,
        };
      });

    // The loser keeps its `dedupHash`, `normalizedTitle` and classification block.
    // The hash is UNIQUE and still routes tier 2 to this row, which is exactly what
    // makes future postings of the losing spelling follow the redirect onto the
    // winner; clearing it would send them back to opening a third job. The
    // classifications stay because the partial unique index allows one current
    // classification per job, and moving them would collide with the winner's.
    await this.canonicalValues.refresh(winner);

    this.logger.log(
      `Merged job ${loser} into ${winner}: ${movedPostings} posting(s) moved, ` +
        `${repointedRedirects} redirect(s) re-pointed`,
    );

    return {
      winnerId: winner,
      loserId: loser,
      outcome: 'MERGED',
      movedPostings,
      repointedRedirects,
    };
  }

  private async assertExists(id: string): Promise<void> {
    const row = await this.prisma.job.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!row) {
      throw new Error(`Cannot merge: job ${id} does not exist`);
    }
  }
}
