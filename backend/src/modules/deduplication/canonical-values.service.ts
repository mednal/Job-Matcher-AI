import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  changedCanonicalValues,
  pickCanonicalPosting,
} from './canonical-values';

/**
 * M7.4 — keeping a cluster's canonical values on the richest posting
 * (`ARCHITECTURE.md` §6.3).
 *
 * The seam M7.2 and M7.3 left open. Both tiers attach postings to a `Job` and
 * deliberately refuse to rewrite its displayed values, because inside a tier "the
 * posting in hand" is the only candidate available and the last posting of a run
 * would silently win. This service answers the question properly: it reads **every**
 * posting of the cluster and applies the pure rule in `canonical-values.ts`.
 *
 * It is a separate class from `CanonicalJobService` so that clustering and display
 * are separately testable — and because M7.4's merge needs the same refresh after
 * moving postings between jobs, without going through the tiers at all.
 */

export interface CanonicalRefresh {
  readonly jobId: string;
  /** False when the job already carried the chosen posting's values. */
  readonly changed: boolean;
  /** The posting the values came from, or null when the cluster has none. */
  readonly sourcePostingId: string | null;
}

/**
 * The seam `CanonicalJobService` depends on, so its unit tests can state what the
 * tiers do without the refresh reading a mocked cluster back out.
 */
export interface CanonicalValueWriter {
  refresh(jobId: string): Promise<CanonicalRefresh>;
}

@Injectable()
export class CanonicalValuesService implements CanonicalValueWriter {
  private readonly logger = new Logger(CanonicalValuesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Re-derives one job's canonical block from its postings and writes it if it
   * moved.
   *
   * Called after every attach and on re-ingestion of an already-clustered posting,
   * because either can change the answer: a new posting may be richer than the
   * incumbent, an edited one may have grown or shrunk, and the M5.6 sweep may have
   * retired the posting the values currently come from.
   *
   * **No transaction, deliberately.** The write is the output of a pure function of
   * rows every writer can see, so two concurrent runs racing on it converge on the
   * same values rather than corrupting each other — the loser simply writes what
   * the winner already wrote. A transaction here would take a row lock on the
   * hottest row in ingestion to defend against a race with no bad outcome.
   */
  async refresh(jobId: string): Promise<CanonicalRefresh> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: {
        title: true,
        companyName: true,
        location: true,
        workplaceType: true,
        employmentType: true,
        language: true,
        description: true,
        technologies: true,
        postedAt: true,
        effectivePostedAt: true,
        postings: {
          select: {
            id: true,
            isActive: true,
            firstSeenAt: true,
            title: true,
            companyName: true,
            location: true,
            workplaceType: true,
            employmentType: true,
            language: true,
            description: true,
            technologies: true,
            postedAt: true,
          },
        },
      },
    });

    if (!job) {
      // The job was deleted between attaching and refreshing. Nothing to write,
      // and nothing the caller can do about it either.
      this.logger.warn(`Cannot refresh canonical values: job ${jobId} is gone`);
      return { jobId, changed: false, sourcePostingId: null };
    }

    const winner = pickCanonicalPosting(job.postings);
    if (!winner) {
      // Every posting was detached (`onDelete: SetNull`). Leaving the last known
      // values in place beats blanking a row the user may have saved.
      this.logger.warn(`Job ${jobId} has no postings; canonical values kept`);
      return { jobId, changed: false, sourcePostingId: null };
    }

    // Listed field by field rather than spread off `job`: this object is the
    // definition of what counts as a canonical value, and a spread would silently
    // widen it the next time a column is added to the select above.
    const next = changedCanonicalValues(winner, {
      title: job.title,
      companyName: job.companyName,
      location: job.location,
      workplaceType: job.workplaceType,
      employmentType: job.employmentType,
      language: job.language,
      description: job.description,
      technologies: job.technologies,
      postedAt: job.postedAt,
      effectivePostedAt: job.effectivePostedAt,
    });
    if (!next) {
      return { jobId, changed: false, sourcePostingId: winner.id };
    }

    await this.prisma.job.update({ where: { id: jobId }, data: next });
    this.logger.log(
      `Job ${jobId} took its canonical values from posting ${winner.id}`,
    );
    return { jobId, changed: true, sourcePostingId: winner.id };
  }
}
