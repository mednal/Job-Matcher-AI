import type { PrismaService } from '../../common/prisma/prisma.service';
import { classificationInputHash } from './classification-input-hash';
import type {
  ClassificationResult,
  JuniorClassifier,
} from './junior-classifier';
import {
  JobClassificationService,
  type ClassifiableJob,
} from './job-classification.service';
import { createSignal } from './signal';

/**
 * M8.4 — what the store does with a verdict.
 *
 * The rules being asserted are the three §6.4 states: every result is written under
 * its version and its input hash, unchanged text does not reach the classifier at
 * all, and the current row is mirrored onto `Job`. The classifier itself is a stub
 * here — M8.3's corpus is where the verdicts are argued, and this file is about what
 * happens to one after it exists. `classification-persistence.e2e-spec.ts` runs the
 * real classifier against a real database.
 */

interface PrismaMock {
  jobClassification: {
    findUnique: jest.Mock;
    updateMany: jest.Mock;
    update: jest.Mock;
    upsert: jest.Mock;
  };
  job: { update: jest.Mock };
  $transaction: jest.Mock;
}

const JOB: ClassifiableJob = {
  id: 'job-1',
  title: 'Junior Backend Developer (m/w/d)',
  description: 'Entry level position. Training provided.',
};

const RESULT: ClassificationResult = {
  classifierVersion: 'rules-1.0',
  level: 'ENTRY_LEVEL',
  minYears: null,
  maxYears: 1,
  positiveSignals: [
    createSignal('ENTRY_LEVEL_STATED', 'Entry level position'),
    createSignal('TRAINING_PROVIDED', 'Training provided'),
  ],
  negativeSignals: [],
};

const NOW = new Date('2026-08-23T10:00:00.000Z');

/** The stored row the mock hands back, shaped like the service's `select`. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'classification-1',
    level: RESULT.level,
    score: 0,
    minYears: RESULT.minYears,
    maxYears: RESULT.maxYears,
    isCurrent: true,
    ...overrides,
  };
}

describe('JobClassificationService', () => {
  let prisma: PrismaMock;
  let classify: jest.Mock;
  let classifier: JuniorClassifier;
  let service: JobClassificationService;

  const build = (scorer?: (result: ClassificationResult) => number) =>
    new JobClassificationService(
      prisma as unknown as PrismaService,
      classifier,
      scorer,
      () => NOW,
    );

  interface UpsertCall {
    where: { jobId_classifierVersion_inputHash: Record<string, string> };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }

  interface UpdateCall {
    where: { id: string };
    data: Record<string, unknown>;
  }

  const upsertArgs = (): UpsertCall =>
    (
      prisma.jobClassification.upsert.mock.calls as unknown as unknown[][]
    )[0][0] as UpsertCall;

  const jobUpdateArgs = (): UpdateCall =>
    (
      prisma.job.update.mock.calls as unknown as unknown[][]
    )[0][0] as UpdateCall;

  beforeEach(() => {
    prisma = {
      jobClassification: {
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue(row()),
        upsert: jest.fn().mockResolvedValue(row()),
      },
      job: { update: jest.fn().mockResolvedValue({ id: JOB.id }) },
      $transaction: jest.fn((run: (tx: unknown) => unknown) => run(prisma)),
    };
    classify = jest.fn().mockResolvedValue(RESULT);
    classifier = { version: 'rules-1.0', classify };
    service = build();
  });

  describe('text this version has not classified', () => {
    it('classifies it and writes the row under version and input hash', async () => {
      const stored = await service.classifyAndPersist(JOB);

      expect(classify).toHaveBeenCalledWith({
        title: JOB.title,
        description: JOB.description,
      });

      const args = upsertArgs();
      expect(args.where.jobId_classifierVersion_inputHash).toEqual({
        jobId: JOB.id,
        classifierVersion: 'rules-1.0',
        inputHash: classificationInputHash(JOB),
      });
      expect(args.create).toMatchObject({
        jobId: JOB.id,
        classifierVersion: 'rules-1.0',
        level: 'ENTRY_LEVEL',
        minYears: null,
        maxYears: 1,
        isCurrent: true,
      });
      expect(stored.outcome).toBe('CLASSIFIED');
      expect(stored.classificationId).toBe('classification-1');
    });

    it('stores both signal lists with their verbatim evidence', () => {
      return service.classifyAndPersist(JOB).then(() => {
        expect(upsertArgs().create).toMatchObject({
          positiveSignals: [
            {
              code: 'ENTRY_LEVEL_STATED',
              weight: 30,
              evidence: 'Entry level position',
            },
            {
              code: 'TRAINING_PROVIDED',
              weight: 15,
              evidence: 'Training provided',
            },
          ],
          negativeSignals: [],
        });
      });
    });

    it('stands the previous current row down before writing, in one transaction', async () => {
      await service.classifyAndPersist(JOB);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.jobClassification.updateMany).toHaveBeenCalledWith({
        where: { jobId: JOB.id, isCurrent: true },
        data: { isCurrent: false },
      });

      const order = [
        prisma.jobClassification.updateMany.mock.invocationCallOrder[0],
        prisma.jobClassification.upsert.mock.invocationCallOrder[0],
      ];
      expect(order[0]).toBeLessThan(order[1]);
    });

    it('denormalizes the current row onto the job', async () => {
      await service.classifyAndPersist(JOB);

      expect(jobUpdateArgs()).toEqual({
        where: { id: JOB.id },
        data: {
          juniorLevel: 'ENTRY_LEVEL',
          juniorScore: 0,
          requiredMinYears: null,
          requiredMaxYears: 1,
          classifiedAt: NOW,
        },
      });
    });

    it('classifies a job with no description rather than skipping it', async () => {
      await service.classifyAndPersist({ ...JOB, description: null });

      expect(classify).toHaveBeenCalledWith({
        title: JOB.title,
        description: null,
      });
      expect(
        upsertArgs().where.jobId_classifierVersion_inputHash,
      ).toMatchObject({
        inputHash: classificationInputHash({
          title: JOB.title,
          description: null,
        }),
      });
    });
  });

  describe('text this version has already classified', () => {
    beforeEach(() => {
      prisma.jobClassification.findUnique.mockResolvedValue(row());
    });

    it('does not run the classifier again', async () => {
      const stored = await service.classifyAndPersist(JOB);

      expect(classify).not.toHaveBeenCalled();
      expect(stored.outcome).toBe('CACHED');
      expect(stored.level).toBe('ENTRY_LEVEL');
    });

    it('writes nothing at all when the stored row is already current', async () => {
      await service.classifyAndPersist(JOB);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.jobClassification.upsert).not.toHaveBeenCalled();
      expect(prisma.jobClassification.updateMany).not.toHaveBeenCalled();
      expect(prisma.job.update).not.toHaveBeenCalled();
    });

    it('looks the row up by job, version and input hash', async () => {
      await service.classifyAndPersist(JOB);

      expect(prisma.jobClassification.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            jobId_classifierVersion_inputHash: {
              jobId: JOB.id,
              classifierVersion: 'rules-1.0',
              inputHash: classificationInputHash(JOB),
            },
          },
        }),
      );
    });

    it('re-adopts a row that had been stood down, without re-classifying', async () => {
      prisma.jobClassification.findUnique.mockResolvedValue(
        row({ isCurrent: false }),
      );

      const stored = await service.classifyAndPersist(JOB);

      expect(classify).not.toHaveBeenCalled();
      expect(stored.outcome).toBe('CACHED');
      expect(prisma.jobClassification.updateMany).toHaveBeenCalledWith({
        where: {
          jobId: JOB.id,
          isCurrent: true,
          id: { not: 'classification-1' },
        },
        data: { isCurrent: false },
      });
      expect(prisma.jobClassification.update).toHaveBeenCalledWith({
        where: { id: 'classification-1' },
        data: { isCurrent: true },
      });
      expect(jobUpdateArgs().data).toMatchObject({
        juniorLevel: 'ENTRY_LEVEL',
        classifiedAt: NOW,
      });
    });
  });

  describe('a description that changed', () => {
    it('classifies again under a different input hash', async () => {
      const edited = {
        ...JOB,
        description: 'We require 5+ years of professional experience.',
      };

      await service.classifyAndPersist(edited);

      const written =
        upsertArgs().where.jobId_classifierVersion_inputHash.inputHash;
      expect(written).toBe(classificationInputHash(edited));
      expect(written).not.toBe(classificationInputHash(JOB));
      expect(classify).toHaveBeenCalledTimes(1);
    });
  });

  describe('the score', () => {
    it('is zero while no scorer is bound — M8.5 owns the number', async () => {
      await service.classifyAndPersist(JOB);

      expect(upsertArgs().create).toMatchObject({ score: 0 });
      expect(jobUpdateArgs().data).toMatchObject({ juniorScore: 0 });
    });

    it('comes from the bound scorer, and reaches both the row and the job', async () => {
      const scorer = jest.fn().mockReturnValue(88);
      prisma.jobClassification.upsert.mockResolvedValue(row({ score: 88 }));
      service = build(scorer);

      const stored = await service.classifyAndPersist(JOB);

      expect(scorer).toHaveBeenCalledWith(RESULT);
      expect(upsertArgs().create).toMatchObject({ score: 88 });
      expect(jobUpdateArgs().data).toMatchObject({ juniorScore: 88 });
      expect(stored.score).toBe(88);
    });
  });
});
