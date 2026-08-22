import { IngestionStatus } from '@prisma/client';
import {
  StaleRunReaperService,
  STALE_RUN_AFTER_MS,
} from './stale-run-reaper.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const NOW = new Date('2026-08-22T12:00:00.000Z');

interface ReapArgs {
  where: {
    status: string;
    startedAt: { lt: Date };
    sourceId?: string;
  };
  data: {
    status: string;
    finishedAt: Date;
    errorMessage: string;
  };
}

describe('StaleRunReaperService', () => {
  let prisma: { ingestionRun: { updateMany: jest.Mock } };
  let service: StaleRunReaperService;

  /**
   * jest types `mock.calls` as `any[][]`, so reading an argument off it defeats
   * type-checking in exactly the assertions that most need it. Narrow once, here.
   */
  const reapArgs = (): ReapArgs =>
    (
      prisma.ingestionRun.updateMany.mock.calls as unknown as unknown[][]
    )[0][0] as ReapArgs;

  beforeEach(() => {
    prisma = { ingestionRun: { updateMany: jest.fn() } };
    service = new StaleRunReaperService(
      prisma as unknown as PrismaService,
      () => NOW,
    );
  });

  it('only ever touches rows still marked RUNNING', async () => {
    prisma.ingestionRun.updateMany.mockResolvedValue({ count: 0 });

    await service.reap();

    // A SUCCESS or FAILED row is finished bookkeeping; rewriting it would destroy
    // the record of what happened.
    expect(reapArgs().where.status).toBe(IngestionStatus.RUNNING);
  });

  it('reaps by the stale threshold measured from the injected clock', async () => {
    prisma.ingestionRun.updateMany.mockResolvedValue({ count: 0 });

    await service.reap();

    expect(reapArgs().where.startedAt.lt).toEqual(
      new Date(NOW.getTime() - STALE_RUN_AFTER_MS),
    );
  });

  it('marks reaped runs FAILED with an explanatory message', async () => {
    prisma.ingestionRun.updateMany.mockResolvedValue({ count: 2 });

    await service.reap();

    const { data } = reapArgs();
    expect(data.status).toBe(IngestionStatus.FAILED);
    expect(data.finishedAt).toEqual(NOW);
    expect(data.errorMessage).toMatch(/abandoned/i);
  });

  it('scopes to one source when a sourceId is given', async () => {
    prisma.ingestionRun.updateMany.mockResolvedValue({ count: 1 });

    await service.reap('source-1');

    // Starting a run for one source must not rewrite another source's bookkeeping.
    expect(reapArgs().where.sourceId).toBe('source-1');
  });

  it('does not filter by source when none is given', async () => {
    prisma.ingestionRun.updateMany.mockResolvedValue({ count: 0 });

    await service.reap();

    expect(reapArgs().where.sourceId).toBeUndefined();
  });

  it('returns how many rows it reaped', async () => {
    prisma.ingestionRun.updateMany.mockResolvedValue({ count: 3 });

    await expect(service.reap()).resolves.toBe(3);
  });

  it('is a no-op when nothing is stale', async () => {
    prisma.ingestionRun.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.reap()).resolves.toBe(0);
  });

  it('leaves a run that is merely young alone', async () => {
    prisma.ingestionRun.updateMany.mockResolvedValue({ count: 0 });

    await service.reap();

    const cutoff = reapArgs().where.startedAt.lt;
    const justStarted = new Date(NOW.getTime() - 60_000);

    // Reaping a slow-but-live run would let a second run start alongside it, which
    // is the exact condition the concurrency guard exists to prevent.
    expect(justStarted.getTime()).toBeGreaterThan(cutoff.getTime());
  });

  it('defaults to the real clock when none is injected', () => {
    expect(
      () => new StaleRunReaperService(prisma as unknown as PrismaService),
    ).not.toThrow();
  });
});
