import { PrismaService } from '../../common/prisma/prisma.service';
import { CanonicalValuesService } from './canonical-values.service';

interface PrismaMock {
  job: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
}

const POSTED_AT = new Date('2026-08-19T09:00:00.000Z');

/** One posting row, as `refresh` selects it. */
function posting(overrides: Record<string, unknown> = {}) {
  return {
    id: 'posting-1',
    isActive: true,
    firstSeenAt: new Date('2026-08-20T09:00:00.000Z'),
    title: 'Junior Backend Developer (m/w/d)',
    companyName: 'Nordwind Software GmbH',
    location: 'Berlin, Germany',
    workplaceType: 'HYBRID',
    employmentType: 'FULL_TIME',
    language: 'de',
    description: 'Entry level position. Training provided.',
    technologies: ['java', 'spring-boot'],
    postedAt: POSTED_AT,
    ...overrides,
  };
}

/** The job row, carrying the first posting's values unless told otherwise. */
function job(overrides: Record<string, unknown> = {}) {
  const source = posting();
  return {
    id: 'job-1',
    title: source.title,
    companyName: source.companyName,
    location: source.location,
    workplaceType: source.workplaceType,
    employmentType: source.employmentType,
    language: source.language,
    description: source.description,
    technologies: source.technologies,
    postedAt: source.postedAt,
    effectivePostedAt: POSTED_AT,
    postings: [source],
    ...overrides,
  };
}

describe('CanonicalValuesService', () => {
  let prisma: PrismaMock;
  let service: CanonicalValuesService;

  interface UpdateCall {
    where: { id: string };
    data: Record<string, unknown>;
  }

  const updateArgs = (): UpdateCall =>
    (
      prisma.job.update.mock.calls as unknown as unknown[][]
    )[0][0] as UpdateCall;

  beforeEach(() => {
    prisma = {
      job: {
        findUnique: jest.fn().mockResolvedValue(job()),
        update: jest.fn().mockResolvedValue({ id: 'job-1' }),
      },
    };
    service = new CanonicalValuesService(prisma as unknown as PrismaService);
  });

  it('writes nothing when the job already carries the richest posting values', async () => {
    const result = await service.refresh('job-1');

    expect(result).toEqual({
      jobId: 'job-1',
      changed: false,
      sourcePostingId: 'posting-1',
    });
    expect(prisma.job.update).not.toHaveBeenCalled();
  });

  it('moves the canonical values onto the richest posting', async () => {
    prisma.job.findUnique.mockResolvedValue(
      job({
        postings: [
          posting(),
          posting({
            id: 'posting-2',
            title: 'Backend Developer (Java)',
            description:
              'A far longer advertisement listing responsibilities and benefits.',
            technologies: ['java', 'kafka'],
          }),
        ],
      }),
    );

    const result = await service.refresh('job-1');

    expect(result).toEqual({
      jobId: 'job-1',
      changed: true,
      sourcePostingId: 'posting-2',
    });
    expect(updateArgs()).toMatchObject({
      where: { id: 'job-1' },
      data: {
        title: 'Backend Developer (Java)',
        technologies: ['java', 'kafka'],
      },
    });
  });

  it('never writes an identity column, a stamp, or the classification block', async () => {
    prisma.job.findUnique.mockResolvedValue(
      job({
        postings: [
          posting({ id: 'posting-2', description: 'A longer advertisement.' }),
        ],
      }),
    );

    await service.refresh('job-1');

    // The identity four are frozen (`dedupHash` is UNIQUE and derived from three
    // of them); the stamps belong to the tiers and the M5.6 sweep; the
    // classification block is Phase 8's and cannot be re-decided without the
    // classifier.
    expect(Object.keys(updateArgs().data).sort()).toEqual([
      'companyName',
      'description',
      'effectivePostedAt',
      'employmentType',
      'language',
      'location',
      'postedAt',
      'technologies',
      'title',
      'workplaceType',
    ]);
  });

  it('keeps the existing values when every posting was detached', async () => {
    // Reachable through `onDelete: SetNull`. Blanking a row a user may have saved
    // is worse than showing its last known copy.
    prisma.job.findUnique.mockResolvedValue(job({ postings: [] }));

    const result = await service.refresh('job-1');

    expect(result).toEqual({
      jobId: 'job-1',
      changed: false,
      sourcePostingId: null,
    });
    expect(prisma.job.update).not.toHaveBeenCalled();
  });

  it('does nothing when the job is gone', async () => {
    prisma.job.findUnique.mockResolvedValue(null);

    const result = await service.refresh('job-1');

    expect(result).toEqual({
      jobId: 'job-1',
      changed: false,
      sourcePostingId: null,
    });
    expect(prisma.job.update).not.toHaveBeenCalled();
  });
});
