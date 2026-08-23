import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { PaginatedResponse } from '../src/common/dto/paginated.response';
import { AuthTokensResponse } from '../src/modules/auth/dto/auth-tokens.response';
import { SavedJobResponse } from '../src/modules/saved-jobs/dto/saved-job.response';

/**
 * M10.1 — `GET`/`POST /saved-jobs` and `DELETE /saved-jobs/:jobId` — and M10.2,
 * where a saved job survives what the pipeline later does to the job it names.
 *
 * The milestone's `Verify:` line is two runs: the `the save lifecycle` block
 * walks save → list → save again with no duplicate → delete → list empty, and
 * `ownership` proves user B cannot delete or see user A's saved job.
 *
 * Like the other suites here it creates and removes its own rows, so it passes
 * against a database that has never been seeded and leaves nothing behind. Both
 * accounts are fresh, so a user's saved list starts empty and every count in this
 * file can be exact rather than "at least".
 */
const RUN_ID = randomUUID();
const SOURCE_KEY = `saved-jobs-e2e-${RUN_ID}`;
const TEST_EMAIL_DOMAIN = 'saved-jobs-e2e.test';

function body<T>(res: request.Response): T {
  return res.body as T;
}

interface Fixtures {
  sourceId: string;
  /** Three ordinary jobs, saved and unsaved by the cases below. */
  jobIds: string[];
  /** Deactivated: still a legitimate thing to have saved (docs/DATABASE.md §8). */
  inactiveJobId: string;
  /** Merged away (D2). Its row survives, so a save against it must too. */
  mergedJobId: string;
  /** Merged into `mergedJobId`, which is itself merged: a two-hop chain. */
  chainedJobId: string;
}

describe('Saved jobs (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: Fixtures;
  /** Two independent accounts — the ownership cases need a second owner. */
  let tokenA: string;
  let tokenB: string;
  let userIdA: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    fixtures = await createFixtures(prisma);

    const a = await register('user-a');
    const b = await register('user-b');
    tokenA = a.token;
    userIdA = a.userId;
    tokenB = b.token;
  });

  afterAll(async () => {
    const testUsers = await prisma.user.findMany({
      where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
      select: { id: true },
    });
    const userIds = testUsers.map((user) => user.id);
    if (userIds.length > 0) {
      // SavedJob cascades from both sides, but it goes first and explicitly so
      // the suite leaves nothing behind even if a relation changes.
      await prisma.savedJob.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (fixtures) {
      await prisma.jobPosting.deleteMany({
        where: { sourceId: fixtures.sourceId },
      });
      // The merged-away jobs hold foreign keys to the rows they redirect to, so
      // every redirect is cleared before anything is deleted.
      await prisma.job.updateMany({
        where: { dedupHash: { endsWith: RUN_ID } },
        data: { mergedIntoJobId: null },
      });
      await prisma.job.deleteMany({
        where: { dedupHash: { endsWith: RUN_ID } },
      });
      await prisma.jobSource.delete({ where: { id: fixtures.sourceId } });
    }
    await app.close();
  });

  const server = () => app.getHttpServer();

  async function register(
    label: string,
  ): Promise<{ token: string; userId: string }> {
    const email = `${label}-${RUN_ID}@${TEST_EMAIL_DOMAIN}`;
    const res = await request(server())
      .post('/api/v1/auth/register')
      .send({ email, password: 'a-strong-password' })
      .expect(201);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { id: true },
    });
    return {
      token: body<AuthTokensResponse>(res).accessToken,
      userId: user.id,
    };
  }

  const save = (token: string, jobId: string) =>
    request(server())
      .post('/api/v1/saved-jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ jobId });

  const unsave = (token: string, jobId: string) =>
    request(server())
      .delete(`/api/v1/saved-jobs/${jobId}`)
      .set('Authorization', `Bearer ${token}`);

  const listRaw = (token: string, query = '') =>
    request(server())
      .get(`/api/v1/saved-jobs${query}`)
      .set('Authorization', `Bearer ${token}`);

  async function list(
    token: string,
    query = '',
  ): Promise<PaginatedResponse<SavedJobResponse>> {
    const res = await listRaw(token, query).expect(200);
    return body<PaginatedResponse<SavedJobResponse>>(res);
  }

  const savedIds = (page: PaginatedResponse<SavedJobResponse>) =>
    page.items.map((item) => item.jobId);

  // Every case owns its own starting state: the two accounts are shared across
  // the file, so a case that left rows behind would leak into the next one.
  afterEach(async () => {
    await prisma.savedJob.deleteMany({
      where: { job: { dedupHash: { endsWith: RUN_ID } } },
    });
  });

  describe('authentication', () => {
    // Unlike /jobs/search there is no anonymous answer: a collection belongs to
    // an account, so all three routes are JWT-only (docs/ARCHITECTURE.md §8).
    it('refuses every route without a token', async () => {
      await request(server()).get('/api/v1/saved-jobs').expect(401);
      await request(server())
        .post('/api/v1/saved-jobs')
        .send({ jobId: fixtures.jobIds[0] })
        .expect(401);
      await request(server())
        .delete(`/api/v1/saved-jobs/${fixtures.jobIds[0]}`)
        .expect(401);
    });

    it('refuses an invalid token', async () => {
      await request(server())
        .get('/api/v1/saved-jobs')
        .set('Authorization', 'Bearer not.a.token')
        .expect(401);
    });
  });

  // The Verify line, first half: save, list, save again with no duplicate,
  // delete, list empty.
  describe('the save lifecycle', () => {
    it('walks save, list, save again, delete, list empty', async () => {
      const jobId = fixtures.jobIds[0];

      await save(tokenA, jobId).expect(201);
      expect(savedIds(await list(tokenA))).toEqual([jobId]);

      // Saving twice is idempotent: the same answer, and still one row.
      await save(tokenA, jobId).expect(201);
      const afterSecond = await list(tokenA);
      expect(savedIds(afterSecond)).toEqual([jobId]);
      expect(afterSecond.total).toBe(1);

      await unsave(tokenA, jobId).expect(204);
      const afterDelete = await list(tokenA);
      expect(afterDelete.items).toEqual([]);
      expect(afterDelete.total).toBe(0);
    });

    // The unique index, read from the database rather than inferred from the API.
    it('writes exactly one row however many times a job is saved', async () => {
      const jobId = fixtures.jobIds[0];

      await save(tokenA, jobId).expect(201);
      await save(tokenA, jobId).expect(201);
      await save(tokenA, jobId).expect(201);

      await expect(
        prisma.savedJob.count({ where: { userId: userIdA, jobId } }),
      ).resolves.toBe(1);
    });

    // Re-saving must not re-stamp `createdAt`, or a job would jump to the top of
    // the user's list every time a client repeated a save it already made.
    it('keeps the first save time when a job is saved again', async () => {
      const jobId = fixtures.jobIds[0];
      await save(tokenA, jobId).expect(201);
      const first = (await list(tokenA)).items[0].savedAt;

      await save(tokenA, jobId).expect(201);

      expect((await list(tokenA)).items[0].savedAt).toEqual(first);
    });

    it('starts empty for an account that has saved nothing', async () => {
      const page = await list(tokenB);

      expect(page.items).toEqual([]);
      expect(page.total).toBe(0);
    });
  });

  // The Verify line, second half. Ownership is structural: no route names a
  // SavedJob by its own id, and every query is keyed by the token's user.
  describe('ownership', () => {
    it('does not let user B delete user A’s saved job', async () => {
      const jobId = fixtures.jobIds[0];
      await save(tokenA, jobId).expect(201);

      await unsave(tokenB, jobId).expect(404);

      // The row is still A's, and A can still see it.
      expect(savedIds(await list(tokenA))).toEqual([jobId]);
      await expect(
        prisma.savedJob.count({ where: { userId: userIdA, jobId } }),
      ).resolves.toBe(1);
    });

    // The same 404 either way, so the endpoint cannot be used to find out what
    // another account has saved. Both answers come from one query that matched
    // on (userId, jobId) and never saw the difference.
    it('answers the same way whether the save is absent or another user’s', async () => {
      const someoneElses = fixtures.jobIds[0];
      const neverSaved = fixtures.jobIds[1];
      await save(tokenA, someoneElses).expect(201);

      const otherUsers = await unsave(tokenB, someoneElses).expect(404);
      const absent = await unsave(tokenB, neverSaved).expect(404);

      expect(otherUsers.body).toEqual(absent.body);
    });

    it('shows each user only their own saves', async () => {
      await save(tokenA, fixtures.jobIds[0]).expect(201);
      await save(tokenB, fixtures.jobIds[1]).expect(201);

      expect(savedIds(await list(tokenA))).toEqual([fixtures.jobIds[0]]);
      expect(savedIds(await list(tokenB))).toEqual([fixtures.jobIds[1]]);
    });

    // Two users saving the same job are two rows, not a conflict — the unique is
    // on the pair, not on the job.
    it('lets two users save the same job independently', async () => {
      const jobId = fixtures.jobIds[0];

      await save(tokenA, jobId).expect(201);
      await save(tokenB, jobId).expect(201);
      await unsave(tokenA, jobId).expect(204);

      expect(await list(tokenA)).toMatchObject({ items: [], total: 0 });
      expect(savedIds(await list(tokenB))).toEqual([jobId]);
    });
  });

  describe('the list', () => {
    it('returns the { items, page, pageSize, total } envelope', async () => {
      await save(tokenA, fixtures.jobIds[0]).expect(201);

      const page = await list(tokenA);

      expect(Object.keys(page).sort()).toEqual([
        'items',
        'page',
        'pageSize',
        'total',
      ]);
    });

    it('carries the job summary and the save time', async () => {
      await save(tokenA, fixtures.jobIds[0]).expect(201);

      const [item] = (await list(tokenA)).items;

      expect(item.jobId).toBe(fixtures.jobIds[0]);
      expect(typeof item.savedAt).toBe('string');
      expect(item.job).toMatchObject({
        id: fixtures.jobIds[0],
        title: expect.any(String) as string,
        companyName: expect.any(String) as string,
        sourceCount: 1,
      });
      // The summary omits the largest column, as every other list does.
      expect(item.job).not.toHaveProperty('description');
      // An ordinary save: nothing was merged, nothing has gone stale.
      expect(item.isActive).toBe(true);
      expect(item.redirectedToJobId).toBeNull();
    });

    it('never exposes the saved row id or the owner', async () => {
      await save(tokenA, fixtures.jobIds[0]).expect(201);

      const [item] = (await list(tokenA)).items;

      expect(item).not.toHaveProperty('id');
      expect(item).not.toHaveProperty('userId');
    });

    it('lists the most recently saved job first', async () => {
      await save(tokenA, fixtures.jobIds[0]).expect(201);
      await save(tokenA, fixtures.jobIds[1]).expect(201);
      await save(tokenA, fixtures.jobIds[2]).expect(201);

      expect(savedIds(await list(tokenA))).toEqual([
        fixtures.jobIds[2],
        fixtures.jobIds[1],
        fixtures.jobIds[0],
      ]);
    });

    it('pages without repeating or dropping a save', async () => {
      for (const jobId of fixtures.jobIds) {
        await save(tokenA, jobId).expect(201);
      }

      const first = savedIds(await list(tokenA, '?page=1&pageSize=2'));
      const second = savedIds(await list(tokenA, '?page=2&pageSize=2'));

      expect(first).toHaveLength(2);
      expect(second).toHaveLength(1);
      expect([...first, ...second].sort()).toEqual([...fixtures.jobIds].sort());
    });

    it('counts every save, not the page', async () => {
      for (const jobId of fixtures.jobIds) {
        await save(tokenA, jobId).expect(201);
      }

      expect((await list(tokenA, '?page=1&pageSize=1')).total).toBe(3);
    });

    // The shared PaginationQuery, which owns these rules; this only proves the
    // route applies them.
    it.each(['pageSize=51', 'page=0', 'page=abc', 'unknownParam=1'])(
      'rejects %s',
      async (query) => {
        await listRaw(tokenA, `?${query}`).expect(400);
      },
    );
  });

  // M10.2 — the Verify line: a saved job whose `Job` was merged resolves through
  // `mergedIntoJobId`, and one whose `Job` went inactive still loads, flagged.
  //
  // A saved job is the user's, whatever later happened to the job. Excluding
  // these rows would unsave them on the user's behalf; M10.1 kept them, and this
  // is what they now say.
  describe('jobs that are no longer listable', () => {
    it('lists a deactivated job, flagged rather than hidden', async () => {
      await save(tokenA, fixtures.inactiveJobId).expect(201);

      const [item] = (await list(tokenA)).items;

      expect(item.jobId).toBe(fixtures.inactiveJobId);
      expect(item.job.id).toBe(fixtures.inactiveJobId);
      expect(item.isActive).toBe(false);
      expect(item.redirectedToJobId).toBeNull();
    });

    it('serves the survivor for a job that was merged away', async () => {
      await save(tokenA, fixtures.mergedJobId).expect(201);

      const [item] = (await list(tokenA)).items;

      // The card is the survivor's...
      expect(item.job.id).toBe(fixtures.jobIds[0]);
      expect(item.redirectedToJobId).toBe(fixtures.jobIds[0]);
      expect(item.isActive).toBe(true);
      // ...while the entry is still the row the user created. The save was never
      // rewritten (M7.4), and the database still holds the id they saved.
      expect(item.jobId).toBe(fixtures.mergedJobId);
      await expect(
        prisma.savedJob.count({
          where: { userId: userIdA, jobId: fixtures.mergedJobId },
        }),
      ).resolves.toBe(1);
    });

    it('walks a merge chain to its end', async () => {
      await save(tokenA, fixtures.chainedJobId).expect(201);

      const [item] = (await list(tokenA)).items;

      // Two hops: chained → merged → the survivor.
      expect(item.jobId).toBe(fixtures.chainedJobId);
      expect(item.job.id).toBe(fixtures.jobIds[0]);
      expect(item.redirectedToJobId).toBe(fixtures.jobIds[0]);
    });

    // The redirect is for display only. Unsaving addresses the row the user
    // owns, so the id they saved is the id that removes it — and the survivor's
    // id, which they never saved, removes nothing.
    it('unsaves a merged job by the id it was saved under', async () => {
      await save(tokenA, fixtures.mergedJobId).expect(201);

      await unsave(tokenA, fixtures.jobIds[0]).expect(404);
      await unsave(tokenA, fixtures.mergedJobId).expect(204);

      expect((await list(tokenA)).items).toEqual([]);
    });

    // Saving both ends of a merge is two rows, because they were two vacancies
    // when they were saved. They show the same card, which is honest: the
    // alternative is rewriting or dropping a row the user created.
    it('keeps a save of the survivor and a save of the tombstone apart', async () => {
      await save(tokenA, fixtures.mergedJobId).expect(201);
      await save(tokenA, fixtures.jobIds[0]).expect(201);

      const page = await list(tokenA);

      expect(page.total).toBe(2);
      expect(savedIds(page).sort()).toEqual(
        [fixtures.mergedJobId, fixtures.jobIds[0]].sort(),
      );
      expect(
        page.items.every((item) => item.job.id === fixtures.jobIds[0]),
      ).toBe(true);
    });
  });

  describe('validation', () => {
    // A foreign key violation would surface as a 500 for input the API can see
    // is wrong, so the job is checked before the row is written.
    it('returns 404 for a job id that exists nowhere', async () => {
      await save(tokenA, randomUUID()).expect(404);
    });

    it.each([
      ['a non-uuid job id', { jobId: 'not-a-uuid' }],
      ['no job id at all', {}],
      ['a job id that is not a string', { jobId: 42 }],
    ])('rejects %s', async (_name, payload) => {
      await request(server())
        .post('/api/v1/saved-jobs')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload)
        .expect(400);
    });

    // The owner is the token, never the body. A userId a client could send is
    // exactly how one account would reach another's rows.
    it('rejects a body naming a user', async () => {
      await request(server())
        .post('/api/v1/saved-jobs')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ jobId: fixtures.jobIds[0], userId: userIdA })
        .expect(400);
    });

    it('rejects a non-uuid job id on delete', async () => {
      await unsave(tokenA, 'not-a-uuid').expect(400);
    });
  });
});

async function createFixtures(prisma: PrismaService): Promise<Fixtures> {
  const source = await prisma.jobSource.create({
    data: {
      key: SOURCE_KEY,
      displayName: 'Saved Jobs E2E Feed',
      accessMethod: 'OFFICIAL_FEED',
      attributionText: 'Synthetic e2e data. Not a real job source.',
    },
    select: { id: true },
  });

  const now = Date.now();

  async function job(
    key: string,
    overrides: { isActive?: boolean } = {},
  ): Promise<string> {
    const created = await prisma.job.create({
      data: {
        title: `Junior Developer (${key})`,
        normalizedTitle: `junior developer (${key})`,
        companyName: 'Ashgrove Software',
        companySlug: `saved-jobs-e2e-${key}-${RUN_ID}`,
        location: 'Berlin',
        countryCode: 'DE',
        workplaceType: 'HYBRID',
        employmentType: 'FULL_TIME',
        language: 'en',
        description: 'An entry level position. No experience required.',
        technologies: ['java'],
        dedupHash: `saved-jobs-e2e-${key}-${RUN_ID}`,
        postedAt: new Date(now),
        effectivePostedAt: new Date(now),
        isActive: overrides.isActive ?? true,
        juniorLevel: 'ENTRY_LEVEL',
        juniorScore: 90,
        requiredMinYears: 0,
        requiredMaxYears: 1,
        classifiedAt: new Date(now),
        postings: {
          create: [
            {
              sourceId: source.id,
              externalId: `${key}-${RUN_ID}`,
              url: `https://fixtures.juniorjob.local/${key}/${RUN_ID}`,
              title: `Junior Developer (${key})`,
              companyName: 'Ashgrove Software',
              companySlug: `saved-jobs-e2e-${key}-${RUN_ID}`,
              language: 'en',
              description: 'An entry level position. No experience required.',
              contentHash: `saved-jobs-e2e-${key}-${RUN_ID}`,
            },
          ],
        },
      },
      select: { id: true },
    });
    return created.id;
  }

  const jobIds = [await job('one'), await job('two'), await job('three')];
  const inactiveJobId = await job('inactive', { isActive: false });
  const mergedJobId = await job('merged');
  await prisma.job.update({
    where: { id: mergedJobId },
    data: { mergedIntoJobId: jobIds[0] },
  });
  // A second hop, so the resolution is a walk rather than one dereference.
  const chainedJobId = await job('chained');
  await prisma.job.update({
    where: { id: chainedJobId },
    data: { mergedIntoJobId: mergedJobId },
  });

  return {
    sourceId: source.id,
    jobIds,
    inactiveJobId,
    mergedJobId,
    chainedJobId,
  };
}
