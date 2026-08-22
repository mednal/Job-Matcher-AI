import { PrismaService } from '../../common/prisma/prisma.service';
import {
  DESCRIPTION_SIMILARITY_THRESHOLD,
  FuzzyMatchService,
  TITLE_SIMILARITY_THRESHOLD,
  type FuzzyMatchQuery,
} from './fuzzy-match.service';

/**
 * The trigram query itself needs a real database and is covered by
 * `test/deduplication-tier3.e2e-spec.ts`. What is unit-tested here is the half a
 * mock can actually prove: which candidate wins, when the description gate refuses
 * one, and that the query is scoped and parameterized the way §6.3 requires.
 */

const LISTING = `
  We are hiring a backend developer for our payments platform in Berlin. You will
  work with Java, Spring Boot and PostgreSQL, ship features to production every
  week, and review pull requests together with your team. Training and a mentor are
  provided for the first six months. Recent graduates are welcome to apply.
`;

const LISTING_REPOSTED = `
  Backend developer wanted for our payments platform in Berlin. You will work with
  Java, Spring Boot and PostgreSQL, ship features to production every week and
  review pull requests with your team. A mentor is provided for the first six
  months. Recent graduates welcome. We offer thirty vacation days.
`;

const OTHER_ROLE = `
  We are hiring a data engineer for our analytics platform in Berlin. You will build
  streaming pipelines with Kafka, dbt and Snowflake, own the warehouse schema and
  partner with analysts across the company. We offer thirty vacation days.
`;

interface PrismaMock {
  $queryRaw: jest.Mock;
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    normalizedTitle: 'backend developer',
    description: LISTING_REPOSTED,
    titleSimilarity: 0.9,
    ...overrides,
  };
}

describe('FuzzyMatchService', () => {
  let prisma: PrismaMock;
  let service: FuzzyMatchService;

  const query = (
    overrides: Partial<FuzzyMatchQuery> = {},
  ): FuzzyMatchQuery => ({
    companySlug: 'nordwind-software',
    normalizedTitle: 'backend developer',
    description: LISTING,
    ...overrides,
  });

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([]) };
    service = new FuzzyMatchService(prisma as unknown as PrismaService);
  });

  it('returns the candidate whose description confirms the title match', async () => {
    prisma.$queryRaw.mockResolvedValue([candidate()]);

    const match = await service.findMatch(query());

    expect(match).not.toBeNull();
    expect(match?.jobId).toBe('job-1');
    expect(match?.titleSimilarity).toBe(0.9);
    expect(match?.descriptionSimilarity).toBeGreaterThanOrEqual(
      DESCRIPTION_SIMILARITY_THRESHOLD,
    );
  });

  it('scopes the query to one companySlug and passes both inputs as parameters', async () => {
    await service.findMatch(query());

    // Tagged template: the first argument is the SQL fragments, the rest are bound
    // parameters. Neither the slug nor the title may reach the statement as text.
    const [fragments, ...params] = prisma.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const sql = fragments.join('?');

    expect(sql).toContain('similarity("normalizedTitle"');
    expect(sql).toContain('"companySlug" = ');
    expect(params).toContain('nordwind-software');
    expect(params).toContain('backend developer');
    expect(params).toContain(TITLE_SIMILARITY_THRESHOLD);
  });

  it('refuses a title candidate whose description is about another role', async () => {
    prisma.$queryRaw.mockResolvedValue([
      candidate({ description: OTHER_ROLE, titleSimilarity: 0.81 }),
    ]);

    // The title gate cleared it; the confirmation is what stops the merge. Below
    // threshold means a new `Job` — the cheap error (§6.3).
    expect(await service.findMatch(query())).toBeNull();
  });

  it('refuses a candidate whose description is too thin to confirm', async () => {
    prisma.$queryRaw.mockResolvedValue([
      candidate({ description: 'Apply now.' }),
    ]);

    // Absence of evidence is not evidence of a match.
    expect(await service.findMatch(query())).toBeNull();
  });

  it('falls through an unconfirmed candidate to a later one that confirms', async () => {
    prisma.$queryRaw.mockResolvedValue([
      candidate({ id: 'job-other', description: OTHER_ROLE }),
      candidate({ id: 'job-same', titleSimilarity: 0.78 }),
    ]);

    // Candidates arrive most-similar-first, but the most similar title is not
    // necessarily the confirmed one.
    expect((await service.findMatch(query()))?.jobId).toBe('job-same');
  });

  it('returns null when no title cleared the similarity floor', async () => {
    prisma.$queryRaw.mockResolvedValue([]);

    expect(await service.findMatch(query())).toBeNull();
  });

  it('keeps both thresholds biased toward splitting', () => {
    // Pinned so a tuning pass (M11, open question 2) has to state its intent here
    // rather than drift downward one commit at a time.
    expect(TITLE_SIMILARITY_THRESHOLD).toBeGreaterThanOrEqual(0.7);
    expect(DESCRIPTION_SIMILARITY_THRESHOLD).toBeGreaterThanOrEqual(0.4);
  });
});
