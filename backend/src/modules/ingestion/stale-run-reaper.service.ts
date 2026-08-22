import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { IngestionStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { INGESTION_CLOCK } from './ingestion.tokens';

/**
 * Closes `IngestionRun` rows left in `RUNNING` (decision A5).
 *
 * This ships with M5.3 rather than with the retention job (M5.6) because the
 * concurrency guard depends on it. A process killed mid-run — OOM, deploy, power
 * loss — leaves a `RUNNING` row that no longer has a process behind it. Without a
 * reaper, the guard reads that row as "a run is already in progress" and refuses to
 * start ever again: the source silently stops ingesting and nothing errors. The two
 * have to ship together or the guard is a foot-gun.
 *
 * `Date.now` is injected so the threshold is testable without waiting for it.
 */

/**
 * A run older than this with no completion is treated as dead. Generous on purpose:
 * reaping a run that is merely slow would let a second run start alongside it, which
 * is the exact condition the guard exists to prevent. A constant rather than
 * configuration — M5.5 owns the ingestion env vars, and nothing here needs to differ
 * per deployment yet.
 */
export const STALE_RUN_AFTER_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class StaleRunReaperService {
  private readonly logger = new Logger(StaleRunReaperService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(INGESTION_CLOCK)
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Marks abandoned runs `FAILED`. Scoped to one source when `sourceId` is given —
   * that is how the concurrency guard uses it, so starting a run for one source
   * never touches another's bookkeeping.
   *
   * Returns the number of rows reaped.
   */
  async reap(sourceId?: string): Promise<number> {
    const cutoff = new Date(this.now().getTime() - STALE_RUN_AFTER_MS);

    const { count } = await this.prisma.ingestionRun.updateMany({
      where: {
        status: IngestionStatus.RUNNING,
        startedAt: { lt: cutoff },
        ...(sourceId ? { sourceId } : {}),
      },
      data: {
        status: IngestionStatus.FAILED,
        finishedAt: this.now(),
        errorMessage:
          'Run abandoned: still RUNNING past the stale threshold with no process ' +
          'reporting completion. Closed by the stale-run reaper.',
      },
    });

    if (count > 0) {
      // Loud, not debug: every reaped row is a run that died without saying so, and
      // a steady trickle of them is a symptom worth chasing.
      this.logger.warn(
        `Reaped ${count} stale ingestion run(s) stuck in RUNNING${
          sourceId ? ` for source ${sourceId}` : ''
        }`,
      );
    }
    return count;
  }
}
