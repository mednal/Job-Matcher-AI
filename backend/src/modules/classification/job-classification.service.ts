import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma, type JuniorLevel } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { classificationInputHash } from './classification-input-hash';
import {
  CLASSIFICATION_CLOCK,
  JUNIOR_SCORER,
  UNSCORED,
  type JuniorScorer,
} from './classification.tokens';
import type {
  ClassificationResult,
  JuniorClassifier,
} from './junior-classifier';
import { RuleBasedClassifier } from './rule-based.classifier';

/**
 * M8.4 — classification persistence (`ARCHITECTURE.md` §6.4, `DATABASE.md` §3.5).
 *
 * M8.1–M8.3 are pure: text in, a verdict out. This service is the only place that
 * verdict meets the database, and it owns the three rules §6.4 states about the
 * stored form:
 *
 *  1. every result is written under its `classifierVersion` and its `inputHash`, and
 *     rows are never deleted, so a rule change can be evaluated against past jobs
 *     before it is promoted;
 *  2. text that has already been classified by this version **does not run the
 *     classifier again** — `inputHash` is the cache key;
 *  3. exactly one row per job is `isCurrent`, and that row is denormalized onto
 *     `Job` so search can filter and sort without a join.
 *
 * It classifies one `Job` rather than sweeping a table, because that is the unit the
 * ingestion pipeline (M5.4) has in hand once deduplication has decided which `Job` a
 * posting belongs to. M7.4's note to this phase — a refresh can move a job's
 * canonical description without any posting looking changed — is answered by calling
 * this whenever those canonical values are written, and by the hash covering exactly
 * the canonical text the classifier reads.
 */

/** What classification needs from a `Job` row: its id and the text §6.4 reads. */
export interface ClassifiableJob {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
}

export type ClassificationOutcome =
  /** The classifier ran and its result was written as the job's current row. */
  | 'CLASSIFIED'
  /** This exact text had already been classified by this version; it was reused. */
  | 'CACHED';

/** The stored row, as callers see it — never a Prisma type (§4.3). */
export interface StoredClassification {
  readonly jobId: string;
  readonly classificationId: string;
  readonly classifierVersion: string;
  readonly inputHash: string;
  readonly level: JuniorLevel;
  readonly score: number;
  readonly minYears: number | null;
  readonly maxYears: number | null;
  readonly outcome: ClassificationOutcome;
}

/** The columns both write paths need back from a row, stored or just written. */
interface ClassificationRow {
  readonly id: string;
  readonly level: JuniorLevel;
  readonly score: number;
  readonly minYears: number | null;
  readonly maxYears: number | null;
  readonly isCurrent: boolean;
}

/** Every column {@link ClassificationRow} needs, for both reads and writes. */
const ROW_SELECT = {
  id: true,
  level: true,
  score: true,
  minYears: true,
  maxYears: true,
  isCurrent: true,
} satisfies Prisma.JobClassificationSelect;

@Injectable()
export class JobClassificationService {
  private readonly logger = new Logger(JobClassificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(RuleBasedClassifier)
    private readonly classifier: JuniorClassifier,
    @Optional()
    @Inject(JUNIOR_SCORER)
    private readonly scorer: JuniorScorer = () => UNSCORED,
    @Optional()
    @Inject(CLASSIFICATION_CLOCK)
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Classifies one job and stores the result, or reuses what is already stored.
   *
   * Safe to call on every ingestion run: unchanged text costs one indexed lookup and
   * writes nothing. A description that changed keeps its old row — that is what
   * `(jobId, classifierVersion, inputHash)` being the unique key is for — and the
   * new one takes over `isCurrent`.
   */
  async classifyAndPersist(
    job: ClassifiableJob,
  ): Promise<StoredClassification> {
    const classifierVersion = this.classifier.version;
    const input = { title: job.title, description: job.description };
    const inputHash = classificationInputHash(input);

    const cached = await this.prisma.jobClassification.findUnique({
      where: {
        jobId_classifierVersion_inputHash: {
          jobId: job.id,
          classifierVersion,
          inputHash,
        },
      },
      select: ROW_SELECT,
    });

    if (cached) {
      // The cache hit that matters is the common one: the same text, already
      // current. It writes nothing at all — not even `classifiedAt`, which would
      // otherwise move on every run and stop meaning "when this verdict was
      // reached". The other case is a description that changed and changed back;
      // the stored row is still the right answer, so it is re-adopted rather than
      // re-classified.
      if (!cached.isCurrent) {
        await this.adopt(job.id, cached);
      }
      return this.toStored(
        job.id,
        classifierVersion,
        inputHash,
        cached,
        'CACHED',
      );
    }

    const result = await this.classifier.classify(input);
    const written = await this.write(job.id, inputHash, result);

    this.logger.debug(
      `Classified job ${job.id} as ${written.level} (${classifierVersion})`,
    );

    return this.toStored(
      job.id,
      classifierVersion,
      inputHash,
      written,
      'CLASSIFIED',
    );
  }

  /**
   * Writes a fresh result as the job's current classification.
   *
   * One transaction, because the statements are one invariant: a job with two
   * `isCurrent` rows violates the partial unique index, and a job whose denormalized
   * block disagrees with its current row is a silent wrong answer in search.
   * Standing the previous rows down has to come first — the index would reject the
   * insert otherwise — which is the order `prisma/seed.ts` uses for the same reason.
   *
   * `upsert` rather than `create`, because the caller's lookup and this insert are
   * not one atomic step: two runs on the same job would otherwise race and one would
   * fail on the unique key. Re-writing an identical row is harmless, since the
   * result is a pure function of text that both runs read.
   */
  private async write(
    jobId: string,
    inputHash: string,
    result: ClassificationResult,
  ): Promise<ClassificationRow> {
    const fields = {
      level: result.level,
      score: this.scorer(result),
      minYears: result.minYears,
      maxYears: result.maxYears,
      positiveSignals:
        result.positiveSignals as unknown as Prisma.InputJsonValue,
      negativeSignals:
        result.negativeSignals as unknown as Prisma.InputJsonValue,
      isCurrent: true,
    };

    return this.prisma.$transaction(async (tx) => {
      await tx.jobClassification.updateMany({
        where: { jobId, isCurrent: true },
        data: { isCurrent: false },
      });

      const row = await tx.jobClassification.upsert({
        where: {
          jobId_classifierVersion_inputHash: {
            jobId,
            classifierVersion: result.classifierVersion,
            inputHash,
          },
        },
        create: {
          jobId,
          classifierVersion: result.classifierVersion,
          inputHash,
          ...fields,
        },
        update: fields,
        select: ROW_SELECT,
      });

      await this.denormalize(tx, jobId, row);
      return row;
    });
  }

  /** Moves `isCurrent` onto an existing row — the description-changed-back case. */
  private async adopt(jobId: string, row: ClassificationRow): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.jobClassification.updateMany({
        where: { jobId, isCurrent: true, id: { not: row.id } },
        data: { isCurrent: false },
      });

      await tx.jobClassification.update({
        where: { id: row.id },
        data: { isCurrent: true },
      });

      await this.denormalize(tx, jobId, row);
    });
  }

  /**
   * Copies the current row onto `Job` (`DATABASE.md` §3.3).
   *
   * The denormalized block exists so search can answer without a join, so it may
   * never hold a different verdict from the row it mirrors — every path that moves
   * `isCurrent` ends here. `requiredMinYears` / `requiredMaxYears` back the
   * `maxYearsRequired` search parameter of M9.2.
   */
  private async denormalize(
    tx: Prisma.TransactionClient,
    jobId: string,
    row: ClassificationRow,
  ): Promise<void> {
    await tx.job.update({
      where: { id: jobId },
      data: {
        juniorLevel: row.level,
        juniorScore: row.score,
        requiredMinYears: row.minYears,
        requiredMaxYears: row.maxYears,
        classifiedAt: this.now(),
      },
    });
  }

  private toStored(
    jobId: string,
    classifierVersion: string,
    inputHash: string,
    row: ClassificationRow,
    outcome: ClassificationOutcome,
  ): StoredClassification {
    return {
      jobId,
      classificationId: row.id,
      classifierVersion,
      inputHash,
      level: row.level,
      score: row.score,
      minYears: row.minYears,
      maxYears: row.maxYears,
      outcome,
    };
  }
}
