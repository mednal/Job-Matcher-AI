import type { Logger } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Walking `Job.mergedIntoJobId` to the surviving row (D2, `DATABASE.md` §3.3).
 *
 * Extracted from `CanonicalJobService` by M7.4, because merging needs the identical
 * walk: a caller that merges into a job someone already merged away must land on
 * the survivor, or it would build a chain instead of shortening one. Two copies of
 * a loop whose termination conditions decide where a posting ends up is exactly the
 * kind of thing that drifts.
 *
 * `JobsService` keeps its own walk deliberately and is not folded in here: the read
 * side ends differently (404 on a broken chain, see below) and `jobs` may not
 * import `deduplication` under `ARCHITECTURE.md` §4.3.
 */

/**
 * Merges are rare and this walk should terminate long before the bound matters; it
 * exists so a cycle written by a bug cannot spin a request forever.
 */
export const MAX_MERGE_HOPS = 10;

/**
 * The end of the merge chain starting at `id`.
 *
 * Where the read side 404s on a chain it cannot follow, the write side has a
 * posting in hand and must put it somewhere, so this **stops at the last row it
 * could read and logs loudly**. A posting attached to a stale tombstone is
 * recoverable; a posting dropped on the floor is not.
 */
export async function resolveCanonicalId(
  prisma: PrismaService,
  id: string,
  logger: Logger,
): Promise<string> {
  const visited = new Set<string>();
  let currentId = id;

  for (let hop = 0; hop <= MAX_MERGE_HOPS; hop++) {
    if (visited.has(currentId)) {
      logger.error(
        `Merge cycle detected while resolving job ${id} (at ${currentId})`,
      );
      return currentId;
    }
    visited.add(currentId);

    const row = await prisma.job.findUnique({
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

  logger.error(`Merge chain for job ${id} exceeded ${MAX_MERGE_HOPS} hops`);
  return currentId;
}
