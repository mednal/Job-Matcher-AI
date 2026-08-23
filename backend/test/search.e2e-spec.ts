import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import type {
  EmploymentType,
  JuniorLevel,
  WorkplaceType,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { PaginatedResponse } from '../src/common/dto/paginated.response';
import { JobSummaryResponse } from '../src/modules/jobs/dto/job-summary.response';
import { AuthTokensResponse } from '../src/modules/auth/dto/auth-tokens.response';

/**
 * M9.1–M9.5 — `GET /jobs/search`: full text, the §8.1 filters, ordering, and
 * query-time profile-fit ranking.
 *
 * The milestone's `Verify:` line is the "language-aware matching" block: a German
 * posting is found by a German query, and the configuration-mismatch case — the
 * same posting under the English configuration — is shown to match nothing. That
 * is the failure mode the design is built against: it does not error, it silently
 * returns fewer jobs.
 *
 * M9.2's `Verify:` line is the `filters` block — one case per parameter plus a
 * combined one. Every filter case pins the query to `RARE_TOKEN`, so the result
 * set is exactly this suite's fixtures and an assertion can name the ids that
 * survive *and* the ones that must not.
 *
 * M9.3's `Verify:` line is the `default result set` block: the two experienced
 * bands are absent until a request names them. The `ordering` block covers the
 * three sorts and each term of the relevance blend.
 *
 * M9.4's `Verify:` line is in `pagination and validation`: `pageSize=500` is
 * rejected and an unknown parameter returns 400.
 *
 * M9.5's `Verify:` line is the `profile-fit ranking` block: the same query ranks
 * differently for two profiles while the stored `juniorScore` is unchanged. That
 * block owns the two accounts this suite registers; every other block runs
 * anonymously, which is also how it keeps proving search works without a token.
 *
 * Like `jobs.e2e-spec.ts`, this suite creates and removes its own rows, so it
 * passes against a database that has never been seeded. Every assertion is on
 * fixture ids or their relative position, never on result counts, so whatever
 * else the local database holds cannot make it flap.
 */
const RUN_ID = randomUUID();
const SOURCE_KEY = `search-e2e-${RUN_ID}`;

/** Invented, so `?q=` can only match this suite's own rows. */
const RARE_TOKEN = 'Zephyrline';

/** M9.5's two accounts. Matched on the domain so cleanup cannot miss one. */
const TEST_EMAIL_DOMAIN = 'search-e2e.test';

function body<T>(res: request.Response): T {
  return res.body as T;
}

interface Fixtures {
  sourceId: string;
  germanJobId: string;
  titleMatchJobId: string;
  descriptionMatchJobId: string;
  inactiveJobId: string;
  mergedJobId: string;
  /** Remote internship in Ireland, python/django, LIKELY_ENTRY_LEVEL, score 72. */
  remoteJobId: string;
  /** Onsite in Munich, java/kotlin, AMBIGUOUS 55, 2-4 years, posted long ago. */
  onsiteJobId: string;
  /** Never classified: every filterable attribute is NULL. */
  unclassifiedJobId: string;
  /** EXPERIENCED — hidden by the default result set, reachable by opting in. */
  experiencedJobId: string;
  /** CLEARLY_EXPERIENCED — the other band `PRODUCT.md` §8 hides by default. */
  clearlyExperiencedJobId: string;
  /**
   * A pair with identical text that disagrees about which should rank first:
   * `staleTopScore` wins on score, `freshLowerScore` on recency.
   */
  staleTopScoreId: string;
  freshLowerScoreId: string;
  /**
   * A pair where the only thing favouring the winner is *where* the query word
   * sits: in its title rather than in a body. It is both older and lower-scored.
   */
  titleWeightWinnerId: string;
  titleWeightLoserId: string;
  /**
   * M9.5's pair: identical text and identical `juniorScore`, differing only in
   * the technologies and the place — the two things a profile ranks by. The rust
   * one is marginally newer, so it leads without a profile and a profile
   * favouring the ruby one has to overturn a standing order rather than break a
   * tie.
   *
   * Both carry technologies and a place that **no other case in this suite
   * names**, so adding them cannot change what M9.2's exact-id filter assertions
   * return.
   */
  rustJobId: string;
  rubyJobId: string;
}

describe('Search (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: Fixtures;
  /** M9.5 — two accounts whose saved profiles point at opposite fixtures. */
  let rustUserToken: string;
  let rubyUserToken: string;
  /** Registered, but has never saved a profile. */
  let profilelessToken: string;

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

    rustUserToken = await register('python-user');
    rubyUserToken = await register('java-user');
    profilelessToken = await register('no-profile-user');
    await saveProfile(rustUserToken, {
      technologies: ['rust', 'wasm'],
      locations: ['Lisbon'],
      countryCodes: ['PT'],
    });
    await saveProfile(rubyUserToken, {
      technologies: ['ruby', 'rails'],
      locations: ['Vienna'],
      countryCodes: ['AT'],
    });
  });

  async function register(label: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `${label}-${RUN_ID}@${TEST_EMAIL_DOMAIN}`,
        password: 'a-strong-password',
      })
      .expect(201);
    return body<AuthTokensResponse>(res).accessToken;
  }

  async function saveProfile(
    token: string,
    profile: Record<string, unknown>,
  ): Promise<void> {
    await request(app.getHttpServer())
      .put('/api/v1/profiles/me')
      .set('Authorization', `Bearer ${token}`)
      .send(profile)
      .expect(200);
  }

  afterAll(async () => {
    if (fixtures) {
      // Postings hold the source, and the merged-away job holds the canonical
      // one, so both go before what they point at.
      await prisma.jobPosting.deleteMany({
        where: { sourceId: fixtures.sourceId },
      });
      // The merged-away job holds a foreign key to its survivor, so it goes
      // first; the rest are matched by the run marker rather than by an id list,
      // so adding a fixture cannot leave a row behind.
      await prisma.job.delete({ where: { id: fixtures.mergedJobId } });
      await prisma.job.deleteMany({
        where: { dedupHash: { endsWith: RUN_ID } },
      });
      await prisma.jobSource.delete({ where: { id: fixtures.sourceId } });
    }
    // The accounts M9.5's block registers. Profile and RefreshToken cascade on a
    // user delete, but both go explicitly so the suite leaves nothing behind even
    // if the relation changes.
    const testUsers = await prisma.user.findMany({
      where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
      select: { id: true },
    });
    const userIds = testUsers.map((user) => user.id);
    if (userIds.length > 0) {
      await prisma.profile.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app.close();
  });

  const server = () => app.getHttpServer();

  // No token unless one is named — every block but M9.5's searches anonymously,
  // which is what keeps "search remains usable without a token" continuously true
  // rather than asserted once.
  async function search(
    query: string,
    token?: string,
  ): Promise<PaginatedResponse<JobSummaryResponse>> {
    const call = request(server()).get(`/api/v1/jobs/search?${query}`);
    if (token !== undefined) {
      void call.set('Authorization', `Bearer ${token}`);
    }
    const res = await call.expect(200);
    return body<PaginatedResponse<JobSummaryResponse>>(res);
  }

  const idsOf = (page: PaginatedResponse<JobSummaryResponse>) =>
    page.items.map((item) => item.id);

  describe('language-aware matching', () => {
    // The Verify line. "Bewerbungen" is indexed as `bewerb` by the German
    // configuration; the query word "Bewerbung" stems to `bewerb` too, so the
    // posting is found by a word that is nowhere in its text verbatim.
    it('finds a German posting with a German query', async () => {
      const page = await search('q=Bewerbung');

      expect(idsOf(page)).toContain(fixtures.germanJobId);
    });

    // Weight A, through the German stemmer: "Softwareentwicklern" and the
    // title's "Softwareentwickler" both stem to `softwareentwickl`.
    it('stems the German title, not just the body', async () => {
      const page = await search('q=Softwareentwicklern');

      expect(idsOf(page)).toContain(fixtures.germanJobId);
    });

    // The configuration-mismatch case, stated directly against the column rather
    // than through the API — the endpoint cannot express the wrong choice, which
    // is the point, so the cost of getting it wrong is shown here instead.
    it('would silently lose the German posting under the English configuration', async () => {
      const [matches] = await prisma.$queryRaw<
        { german: number; english: number }[]
      >`
        SELECT COUNT(*) FILTER (
                 WHERE "searchVector" @@ websearch_to_tsquery('german', 'Bewerbung')
               )::int AS "german",
               COUNT(*) FILTER (
                 WHERE "searchVector" @@ websearch_to_tsquery('english', 'Bewerbung')
               )::int AS "english"
        FROM "Job"
        WHERE "id" = ${fixtures.germanJobId}
      `;

      expect(matches.german).toBe(1);
      // No error, no warning — just one fewer job for the user. This is why the
      // read side derives the configuration from the same column the generated
      // column did (docs/DATABASE.md §5).
      expect(matches.english).toBe(0);
    });

    // The mismatch runs both ways: an English posting is indexed with the English
    // stemmer, and a German-configuration query does not reach it either.
    it('would silently lose an English posting under the German configuration', async () => {
      const [matches] = await prisma.$queryRaw<
        { german: number; english: number }[]
      >`
        SELECT COUNT(*) FILTER (
                 WHERE "searchVector" @@ websearch_to_tsquery('german', 'developing')
               )::int AS "german",
               COUNT(*) FILTER (
                 WHERE "searchVector" @@ websearch_to_tsquery('english', 'developing')
               )::int AS "english"
        FROM "Job"
        WHERE "id" = ${fixtures.titleMatchJobId}
      `;

      expect(matches.english).toBe(1);
      expect(matches.german).toBe(0);
    });

    it('answers one query across both languages in a single result set', async () => {
      // Both postings carry the invented token, and each is stemmed by its own
      // configuration — a mixed-language corpus is the normal case, not an edge.
      const ids = idsOf(await search(`q=${RARE_TOKEN}&pageSize=50`));

      expect(ids).toContain(fixtures.germanJobId);
      expect(ids).toContain(fixtures.titleMatchJobId);
    });
  });

  describe('ranking', () => {
    // The A/B/C weights are baked into the vector at write time, so a title hit
    // outranks a description hit without the query saying so.
    it('ranks a title match above a description match', async () => {
      const ids = idsOf(await search(`q=${RARE_TOKEN}&pageSize=50`));

      expect(ids.indexOf(fixtures.titleMatchJobId)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(fixtures.titleMatchJobId)).toBeLessThan(
        ids.indexOf(fixtures.descriptionMatchJobId),
      );
    });

    it('never exposes the internal rank or the search vector', async () => {
      const page = await search(`q=${RARE_TOKEN}`);
      const item = page.items[0] as unknown as Record<string, unknown>;

      expect(item).not.toHaveProperty('rank');
      expect(item).not.toHaveProperty('searchVector');
      expect(item).not.toHaveProperty('description');
    });
  });

  describe('the result set', () => {
    it('excludes merged-away and deactivated jobs', async () => {
      const ids = idsOf(await search(`q=${RARE_TOKEN}&pageSize=50`));

      expect(ids).not.toContain(fixtures.mergedJobId);
      expect(ids).not.toContain(fixtures.inactiveJobId);
    });

    it('reports how many sources carry a job', async () => {
      const page = await search(`q=${RARE_TOKEN}&pageSize=50`);
      const job = page.items.find(
        (item) => item.id === fixtures.titleMatchJobId,
      );

      expect(job?.sourceCount).toBe(1);
    });

    it('returns the standard envelope and counts every match, not the page', async () => {
      const page = await search(`q=${RARE_TOKEN}&pageSize=1`);

      expect(page.items).toHaveLength(1);
      expect(page.page).toBe(1);
      expect(page.pageSize).toBe(1);
      expect(page.total).toBeGreaterThanOrEqual(3);
    });

    it('pages through the matches without repeating one', async () => {
      const first = idsOf(await search(`q=${RARE_TOKEN}&page=1&pageSize=1`));
      const second = idsOf(await search(`q=${RARE_TOKEN}&page=2&pageSize=1`));

      expect(second[0]).not.toBe(first[0]);
    });

    it('lists jobs without a query at all', async () => {
      const page = await search('pageSize=50');

      expect(page.total).toBeGreaterThanOrEqual(3);
      expect(idsOf(page)).not.toContain(fixtures.mergedJobId);
    });

    // A query of nothing but stopwords parses to an empty tsquery. Matching
    // nothing is the honest answer; matching everything would look like a
    // working search that ignores what was typed.
    it('matches nothing when the query is only stopwords', async () => {
      const page = await search('q=the%20and%20of');

      expect(page.items).toHaveLength(0);
      expect(page.total).toBe(0);
    });

    it('is readable without a token', async () => {
      await request(server()).get('/api/v1/jobs/search').expect(200);
    });
  });

  // M9.2's Verify line: one case per §8.1 parameter, then a combined one. Every
  // query is pinned to RARE_TOKEN, so the candidate set is exactly this suite's
  // fixtures and each case can name both what survives and what must not.
  describe('filters', () => {
    const filtered = async (params: string): Promise<string[]> =>
      idsOf(await search(`q=${RARE_TOKEN}&pageSize=50&${params}`));

    const expectIds = (actual: string[], expected: string[]) =>
      expect([...actual].sort()).toEqual([...expected].sort());

    it('narrows to the jobs carrying a technology slug', async () => {
      expectIds(await filtered('technologies=python'), [fixtures.remoteJobId]);
    });

    // Overlap, not containment: a second chip widens the result set. Reading it
    // as AND would make a two-technology filter almost always empty.
    it('widens when a second technology is added', async () => {
      expectIds(await filtered('technologies=python,kotlin'), [
        fixtures.remoteJobId,
        fixtures.onsiteJobId,
      ]);
    });

    // The slug vocabulary is closed, and one that is not in it is a narrower
    // search, not a bad request — the read side cannot see the dictionary.
    it('returns nothing for a slug no job carries, rather than failing', async () => {
      expectIds(await filtered('technologies=cobol'), []);
    });

    it('matches a location case-insensitively, as a substring', async () => {
      expectIds(await filtered('locations=dublin'), [fixtures.remoteJobId]);
    });

    it('ORs several locations and skips a job that states none', async () => {
      const ids = await filtered('locations=Dublin&locations=Munich');

      expectIds(ids, [fixtures.remoteJobId, fixtures.onsiteJobId]);
      expect(ids).not.toContain(fixtures.unclassifiedJobId);
    });

    // `%` is an ILIKE wildcard. Unescaped it would match every job that has a
    // location — a filter returning more than it named, which is worse than one
    // returning nothing.
    it('treats a wildcard character in a location as a literal', async () => {
      expectIds(await filtered('locations=%25'), []);
    });

    it('matches an exact country code', async () => {
      expectIds(await filtered('countryCode=IE'), [fixtures.remoteJobId]);
    });

    it('filters by workplace type', async () => {
      expectIds(await filtered('workplaceType=REMOTE'), [fixtures.remoteJobId]);
      expectIds(await filtered('workplaceType=REMOTE,ONSITE'), [
        fixtures.remoteJobId,
        fixtures.onsiteJobId,
      ]);
    });

    it('filters by employment type', async () => {
      expectIds(await filtered('employmentType=INTERNSHIP'), [
        fixtures.remoteJobId,
      ]);
    });

    it('filters by junior level', async () => {
      expectIds(await filtered('juniorLevel=EXPERIENCED'), [
        fixtures.experiencedJobId,
      ]);
      expectIds(await filtered('juniorLevel=LIKELY_ENTRY_LEVEL,EXPERIENCED'), [
        fixtures.remoteJobId,
        fixtures.experiencedJobId,
      ]);
    });

    // Without the opt-in the same query cannot reach it, so the case above is
    // asserting the filter and not the default result set (M9.3).
    it('cannot reach an experienced job without naming its level', async () => {
      expectIds(await filtered('technologies=java&locations=Hamburg'), []);
    });

    // A posting that never stated a workplace type is not an answer to
    // "REMOTE" — the absence of a claim is not a claim.
    it('excludes a job whose attribute is unset from an enum filter', async () => {
      const ids = await filtered('workplaceType=REMOTE,ONSITE,HYBRID');

      expect(ids).not.toContain(fixtures.unclassifiedJobId);
    });

    it('filters by minimum junior score', async () => {
      const ids = await filtered('minJuniorScore=80');

      expect(ids).toContain(fixtures.titleMatchJobId);
      expect(ids).not.toContain(fixtures.remoteJobId);
      expect(ids).not.toContain(fixtures.onsiteJobId);
    });

    // Absence of evidence: "at least 80" cannot be answered with a job nothing
    // has scored, so an unclassified job is dropped.
    it('excludes an unscored job from a minimum-score filter', async () => {
      expect(await filtered('minJuniorScore=0')).not.toContain(
        fixtures.unclassifiedJobId,
      );
    });

    it('filters by the years of experience a job demands', async () => {
      const ids = await filtered('maxYearsRequired=1');

      expect(ids).toContain(fixtures.titleMatchJobId);
      expect(ids).not.toContain(fixtures.onsiteJobId);
    });

    // The opposite NULL decision, and deliberately so: an unstated requirement is
    // the absence of a barrier. Dropping these rows would hide most genuinely
    // junior postings — the product's whole purpose.
    it('keeps a job that states no minimum under a years filter', async () => {
      const ids = await filtered('maxYearsRequired=0');

      expect(ids).toContain(fixtures.unclassifiedJobId);
      expect(ids).toContain(fixtures.remoteJobId);
      expect(ids).not.toContain(fixtures.onsiteJobId);
    });

    it('filters by how recently a job was posted', async () => {
      const ids = await filtered('postedWithinDays=1');

      expect(ids).toContain(fixtures.remoteJobId);
      expect(ids).not.toContain(fixtures.onsiteJobId);
    });

    // The combined case. Read aloud: a remote internship in Ireland using Python,
    // scored at least 70, demanding no more than a year, posted this week.
    it('applies every filter at once, as AND', async () => {
      const ids = await filtered(
        'technologies=python&locations=Dublin&countryCode=IE' +
          '&workplaceType=REMOTE&employmentType=INTERNSHIP' +
          '&juniorLevel=LIKELY_ENTRY_LEVEL&minJuniorScore=70' +
          '&maxYearsRequired=1&postedWithinDays=7',
      );

      expectIds(ids, [fixtures.remoteJobId]);
    });

    it('returns nothing when the combined filters contradict each other', async () => {
      expectIds(await filtered('countryCode=IE&workplaceType=ONSITE'), []);
    });

    // An empty parameter is a user who selected no chips, not a filter no job can
    // satisfy.
    it('ignores an empty filter parameter', async () => {
      const unfiltered = await filtered('');

      expectIds(await filtered('technologies=&locations='), unfiltered);
    });

    // Filters narrow the result set and can never widen it past the structural
    // exclusion, or a filtered search would surface a job the unfiltered one hides.
    it('never resurrects a merged or deactivated job', async () => {
      const ids = await filtered('minJuniorScore=80&maxYearsRequired=2');

      expect(ids).not.toContain(fixtures.mergedJobId);
      expect(ids).not.toContain(fixtures.inactiveJobId);
    });

    it('rejects a value outside an enum rather than ignoring the filter', async () => {
      await request(server())
        .get('/api/v1/jobs/search?workplaceType=ANYWHERE')
        .expect(400);
      await request(server())
        .get('/api/v1/jobs/search?countryCode=DEU')
        .expect(400);
      await request(server())
        .get('/api/v1/jobs/search?minJuniorScore=101')
        .expect(400);
    });

    // D7 keeps salary out of the schema entirely, so there is nothing to filter
    // on and the parameter must not look accepted.
    it('rejects a salary filter', async () => {
      await request(server())
        .get('/api/v1/jobs/search?minSalary=40000')
        .expect(400);
    });
  });

  // M9.3's Verify line. `PRODUCT.md` §8: the product optimizes for "jobs I should
  // realistically consider", so the two bands a junior candidate cannot are absent
  // until a request names them.
  describe('the default result set', () => {
    const defaultSet = async (): Promise<string[]> =>
      idsOf(await search(`q=${RARE_TOKEN}&pageSize=50`));

    it('omits both experienced bands', async () => {
      const ids = await defaultSet();

      expect(ids).not.toContain(fixtures.experiencedJobId);
      expect(ids).not.toContain(fixtures.clearlyExperiencedJobId);
    });

    // Naming a level is the opt-in. Overriding an explicit request would be the
    // same failure as ignoring a filter — the user asked, in so many words.
    it('returns an experienced job when the request names its level', async () => {
      const ids = idsOf(
        await search(`q=${RARE_TOKEN}&pageSize=50&juniorLevel=EXPERIENCED`),
      );

      expect(ids).toContain(fixtures.experiencedJobId);
      expect(ids).not.toContain(fixtures.clearlyExperiencedJobId);
    });

    it('returns a clearly experienced job only when that level is named', async () => {
      const ids = idsOf(
        await search(
          `q=${RARE_TOKEN}&pageSize=50&juniorLevel=CLEARLY_EXPERIENCED`,
        ),
      );

      expect(ids).toEqual([fixtures.clearlyExperiencedJobId]);
    });

    // `NULL NOT IN (…)` is `NULL`, not `TRUE`. Written without the explicit IS
    // NULL branch, this predicate would drop every unclassified job from the
    // default view — silently, and only for jobs the pipeline had not reached.
    it('keeps a job that has never been classified', async () => {
      expect(await defaultSet()).toContain(fixtures.unclassifiedJobId);
    });

    it('keeps every band below EXPERIENCED', async () => {
      const ids = await defaultSet();

      expect(ids).toContain(fixtures.titleMatchJobId); // ENTRY_LEVEL
      expect(ids).toContain(fixtures.remoteJobId); // LIKELY_ENTRY_LEVEL
      expect(ids).toContain(fixtures.onsiteJobId); // AMBIGUOUS
    });
  });

  describe('ordering', () => {
    const sorted = async (sort: string): Promise<JobSummaryResponse[]> =>
      (await search(`q=${RARE_TOKEN}&pageSize=50&sort=${sort}`)).items;

    it('defaults to relevance', async () => {
      const implicit = idsOf(await search(`q=${RARE_TOKEN}&pageSize=50`));

      expect(implicit).toEqual((await sorted('relevance')).map((j) => j.id));
    });

    it('orders by junior score, highest first', async () => {
      const scores = (await sorted('juniorScore'))
        .map((job) => job.juniorScore)
        .filter((score): score is number => score !== null);

      expect(scores).toEqual([...scores].sort((a, b) => b - a));
    });

    // PostgreSQL sorts NULLs first under DESC. Without NULLS LAST the highest
    // junior scores would open with the jobs that have none at all.
    it('puts unscored jobs last when sorting by junior score', async () => {
      const items = await sorted('juniorScore');
      const unscored = items.findIndex((job) => job.juniorScore === null);

      expect(unscored).toBeGreaterThan(-1);
      expect(
        items.slice(unscored).every((job) => job.juniorScore === null),
      ).toBe(true);
    });

    it('orders by posting date, newest first', async () => {
      const dates = (await sorted('postedAt')).map((job) =>
        new Date(job.effectivePostedAt).getTime(),
      );

      expect(dates).toEqual([...dates].sort((a, b) => b - a));
    });

    // The three terms of the blend, one case each. First: text rank. The pair is
    // built so the winner is behind on *both* other terms — lower junior score,
    // ten days older — and ahead only on where the query word sits. It leads
    // under `relevance` and trails under each of the other two sorts, so nothing
    // but the text term can be producing the flip.
    it('blends text rank', async () => {
      const byRelevance = (await sorted('relevance')).map((job) => job.id);
      const byScore = (await sorted('juniorScore')).map((job) => job.id);
      const byDate = (await sorted('postedAt')).map((job) => job.id);

      expect(byRelevance.indexOf(fixtures.titleWeightWinnerId)).toBeLessThan(
        byRelevance.indexOf(fixtures.titleWeightLoserId),
      );
      expect(byScore.indexOf(fixtures.titleWeightLoserId)).toBeLessThan(
        byScore.indexOf(fixtures.titleWeightWinnerId),
      );
      expect(byDate.indexOf(fixtures.titleWeightLoserId)).toBeLessThan(
        byDate.indexOf(fixtures.titleWeightWinnerId),
      );
    });

    // Second: junior suitability. The remote job is the newest thing in the set
    // and still ranks below a higher-scoring, older one — so recency is not
    // deciding this, and the score is.
    it('blends junior suitability', async () => {
      const ids = (await sorted('relevance')).map((job) => job.id);

      expect(ids.indexOf(fixtures.titleMatchJobId)).toBeLessThan(
        ids.indexOf(fixtures.remoteJobId),
      );
    });

    // Third: recency. The pair has identical text, so the rank term cancels, and
    // they order oppositely under the two sorts — score wins one, recency the
    // other. Nothing but a recency term in the blend can produce that flip.
    it('blends recency', async () => {
      const byScore = (await sorted('juniorScore')).map((job) => job.id);
      const byRelevance = (await sorted('relevance')).map((job) => job.id);

      expect(byScore.indexOf(fixtures.staleTopScoreId)).toBeLessThan(
        byScore.indexOf(fixtures.freshLowerScoreId),
      );
      expect(byRelevance.indexOf(fixtures.freshLowerScoreId)).toBeLessThan(
        byRelevance.indexOf(fixtures.staleTopScoreId),
      );
    });

    // An unscored job is shown but cannot outrank one we have evidence for.
    it('ranks an unscored job below the scored ones', async () => {
      const ids = (await sorted('relevance')).map((job) => job.id);

      expect(ids.indexOf(fixtures.unclassifiedJobId)).toBeGreaterThan(
        ids.indexOf(fixtures.onsiteJobId),
      );
    });

    // Sorting reorders a result set; it never changes which jobs are in it.
    it('returns the same jobs whichever sort is used', async () => {
      const ids = async (sort: string) =>
        (await sorted(sort)).map((job) => job.id).sort();

      expect(await ids('juniorScore')).toEqual(await ids('relevance'));
      expect(await ids('postedAt')).toEqual(await ids('relevance'));
    });

    it('pages a sorted result set without repeating a job', async () => {
      const first = idsOf(
        await search(`q=${RARE_TOKEN}&sort=juniorScore&page=1&pageSize=3`),
      );
      const second = idsOf(
        await search(`q=${RARE_TOKEN}&sort=juniorScore&page=2&pageSize=3`),
      );

      expect(first).toHaveLength(3);
      expect(first.filter((id) => second.includes(id))).toEqual([]);
    });

    it('rejects a sort it does not implement', async () => {
      await request(server())
        .get('/api/v1/jobs/search?sort=salary')
        .expect(400);
      // Matched exactly: there is no case fold that round-trips `juniorScore`.
      await request(server())
        .get('/api/v1/jobs/search?sort=juniorscore')
        .expect(400);
    });
  });

  // M9.4. The envelope and both bounds come from the shared `PaginationQuery` and
  // `PaginatedResponse`, so the unit spec in `common/dto` owns the parsing rules;
  // these cases prove the endpoint actually applies them.
  /**
   * M9.5. The `Verify:` line is `ranks the same query differently for two
   * profiles` together with `leaves the stored junior score untouched`.
   *
   * Every case runs the *same* query and reads the relative position of the same
   * two fixtures, which differ only in their technologies and their place. The
   * pair is built so the python job leads with no profile at all: a profile that
   * puts the java job first has to overturn a standing order, not break a tie.
   */
  describe('profile-fit ranking', () => {
    const FIT_QUERY = `q=${RARE_TOKEN}&pageSize=50`;

    /** Positive when the rust job ranks ahead of the ruby one. */
    const rustLead = async (token?: string): Promise<number> => {
      const ids = idsOf(await search(FIT_QUERY, token));
      const rust = ids.indexOf(fixtures.rustJobId);
      const ruby = ids.indexOf(fixtures.rubyJobId);

      expect(rust).toBeGreaterThan(-1);
      expect(ruby).toBeGreaterThan(-1);
      return ruby - rust;
    };

    it('ranks the same query differently for two profiles', async () => {
      expect(await rustLead(rustUserToken)).toBeGreaterThan(0);
      expect(await rustLead(rubyUserToken)).toBeLessThan(0);
    });

    // The other half of the flip: without a profile the rust job leads, so the
    // ruby user's ordering is a reversal and not just the default order.
    it('leaves an anonymous request ranked as it was', async () => {
      expect(await rustLead()).toBeGreaterThan(0);
    });

    // Query time only (docs/ARCHITECTURE.md §6.5). The score describes the job,
    // so it is identical in both users' responses and in the row itself.
    it('leaves the stored junior score untouched', async () => {
      // Sorted by id, not left in ranking order: the order is exactly what
      // differs between these three requests, and the score is what must not.
      const scoreOf = async (token?: string) => {
        const items = (await search(FIT_QUERY, token)).items;
        return items
          .filter((job) =>
            [fixtures.rustJobId, fixtures.rubyJobId].includes(job.id),
          )
          .map((job) => [job.id, job.juniorScore])
          .sort();
      };
      const stored = await prisma.job.findMany({
        where: { id: { in: [fixtures.rustJobId, fixtures.rubyJobId] } },
        select: { id: true, juniorScore: true },
        orderBy: { id: 'asc' },
      });

      const anonymous = await scoreOf();
      expect(await scoreOf(rustUserToken)).toEqual(anonymous);
      expect(await scoreOf(rubyUserToken)).toEqual(anonymous);
      expect(stored.map((job) => job.juniorScore)).toEqual([80, 80]);
    });

    // Ranking, never filtering. A profile that narrowed would hide jobs the user
    // never asked to hide, and the same URL would mean different things to
    // different people.
    it('returns the same jobs to both profiles and to no profile', async () => {
      const ids = async (token?: string) =>
        idsOf(await search(FIT_QUERY, token)).sort();

      const anonymous = await ids();
      expect(await ids(rustUserToken)).toEqual(anonymous);
      expect(await ids(rubyUserToken)).toEqual(anonymous);
    });

    it('reports the same total to both profiles', async () => {
      const anonymous = (await search(FIT_QUERY)).total;

      expect((await search(FIT_QUERY, rustUserToken)).total).toBe(anonymous);
      expect((await search(FIT_QUERY, rubyUserToken)).total).toBe(anonymous);
    });

    // A registered user who has never filled anything in is ranked exactly like
    // an anonymous one — an empty profile must not be a profile of nothing.
    it('ranks a user with no saved profile as anonymous', async () => {
      const anonymous = idsOf(await search(FIT_QUERY));

      expect(idsOf(await search(FIT_QUERY, profilelessToken))).toEqual(
        anonymous,
      );
    });

    // An explicit ordering is the answer the caller asked for; a preference must
    // not quietly perturb it.
    it.each(['juniorScore', 'postedAt'])(
      'does not apply profile fit to sort=%s',
      async (sort) => {
        const query = `${FIT_QUERY}&sort=${sort}`;
        const anonymous = idsOf(await search(query));

        expect(idsOf(await search(query, rubyUserToken))).toEqual(anonymous);
      },
    );

    // Search stays usable without a token — and a token that is present but
    // unusable is refused rather than silently downgraded to an anonymous 200,
    // which would tell the client nothing was wrong.
    it('serves an anonymous request and refuses an invalid token', async () => {
      await request(server())
        .get(`/api/v1/jobs/search?${FIT_QUERY}`)
        .expect(200);
      await request(server())
        .get(`/api/v1/jobs/search?${FIT_QUERY}`)
        .set('Authorization', 'Bearer not.a.token')
        .expect(401);
    });

    // §8.1 has no profile-fit parameter: fit follows the token, not a flag. One
    // the backend accepted and ignored, or invented here, would be a contract
    // nothing else in the product knows about.
    it('takes no query parameter of its own', async () => {
      await request(server())
        .get(`/api/v1/jobs/search?${FIT_QUERY}&profileFit=true`)
        .set('Authorization', `Bearer ${rubyUserToken}`)
        .expect(400);
    });
  });

  describe('pagination and validation', () => {
    it('returns the { items, page, pageSize, total } envelope', async () => {
      const page = await search(`q=${RARE_TOKEN}`);

      expect(Object.keys(page).sort()).toEqual([
        'items',
        'page',
        'pageSize',
        'total',
      ]);
      expect(Array.isArray(page.items)).toBe(true);
      expect(page.page).toBe(1);
      expect(page.pageSize).toBe(20);
      expect(typeof page.total).toBe('number');
    });

    // `total` describes the whole match, not the page — that is what makes a page
    // count renderable.
    it('counts every match while returning one page of them', async () => {
      const full = await search(`q=${RARE_TOKEN}&pageSize=50`);
      const first = await search(`q=${RARE_TOKEN}&pageSize=2`);

      expect(first.items).toHaveLength(2);
      expect(first.total).toBe(full.total);
      expect(full.total).toBeGreaterThan(2);
    });

    it('walks the whole result set across pages without gap or repeat', async () => {
      const all = idsOf(await search(`q=${RARE_TOKEN}&pageSize=50`));
      const paged: string[] = [];

      for (let page = 1; paged.length < all.length; page += 1) {
        paged.push(
          ...idsOf(await search(`q=${RARE_TOKEN}&page=${page}&pageSize=2`)),
        );
      }

      expect(paged).toEqual(all);
      expect(new Set(paged).size).toBe(all.length);
    });

    it('returns an empty page past the end, with the total intact', async () => {
      const page = await search(`q=${RARE_TOKEN}&page=50&pageSize=50`);

      expect(page.items).toEqual([]);
      expect(page.total).toBeGreaterThan(0);
    });

    // The Verify line, half one.
    it('rejects a pageSize past the cap', async () => {
      await request(server())
        .get('/api/v1/jobs/search?pageSize=500')
        .expect(400);
      await request(server())
        .get('/api/v1/jobs/search?pageSize=51')
        .expect(400);
    });

    it('accepts the cap itself', async () => {
      const page = await search('pageSize=50');

      expect(page.pageSize).toBe(50);
    });

    /**
     * `Number.isInteger(1e20)` is `true`, so before `MAX_PAGE` this passed
     * validation and became an `OFFSET` past what PostgreSQL's `bigint` holds:
     * the request died in the driver and the caller got a **500 for input the API
     * should have refused**. Both list endpoints were affected, since they share
     * the DTO.
     */
    it('rejects a page too deep to run, rather than failing inside the driver', async () => {
      for (const page of ['201', '1000000', '1e20', '9007199254740991']) {
        const res = await request(server()).get(
          `/api/v1/jobs/search?page=${page}`,
        );

        expect(res.status).toBe(400);
      }
    });

    it.each(['page=0', 'page=-1', 'page=abc', 'pageSize=1.5', 'pageSize=0'])(
      'rejects %s',
      async (query) => {
        await request(server()).get(`/api/v1/jobs/search?${query}`).expect(400);
      },
    );

    // The Verify line, half two. `forbidNonWhitelisted` is what makes every
    // "rejected, not ignored" note in M9.1-M9.3 true.
    it('rejects an unknown query parameter', async () => {
      await request(server())
        .get('/api/v1/jobs/search?unknownParam=1')
        .expect(400);
      // Profile-fit ranking (M9.5) declares no parameter of its own, so this one
      // is unknown and stays unknown.
      await request(server())
        .get(`/api/v1/jobs/search?q=${RARE_TOKEN}&profileFit=true`)
        .expect(400);
    });

    // A repeated key arrives as an array. A scalar parameter must refuse it
    // rather than silently taking one of the two values.
    it('rejects a repeated scalar parameter', async () => {
      await request(server())
        .get('/api/v1/jobs/search?page=1&page=2')
        .expect(400);
      await request(server()).get('/api/v1/jobs/search?q=a&q=b').expect(400);
    });
  });

  describe('the route itself', () => {
    // /jobs/:id is parsed by ParseUUIDPipe. If it were matched first, the literal
    // `search` would come back as a 400 and this whole endpoint would be
    // unreachable — hence SearchModule before JobsModule in AppModule.
    it('is not swallowed by GET /jobs/:id', async () => {
      const res = await request(server()).get('/api/v1/jobs/search');

      expect(res.status).toBe(200);
    });

    it('rejects a query past the length cap', async () => {
      await request(server())
        .get(`/api/v1/jobs/search?q=${'a'.repeat(201)}`)
        .expect(400);
    });

    // Punctuation a user types must be a search, not a 500 — which is why the
    // repository uses websearch_to_tsquery rather than to_tsquery.
    it('survives punctuation a raw tsquery would choke on', async () => {
      await search('q=%26%20%7C%20%3A*%21');
      await search(`q=%22${RARE_TOKEN}%20developer%22`);
      await search(`q=${RARE_TOKEN}%20-nonexistentword`);
    });
  });
});

/**
 * A fixture override, where `undefined` means "use the default" and `null` is a
 * value in its own right. `??` cannot express that difference, and the NULL
 * semantics of `minJuniorScore` and `maxYearsRequired` are exactly what it is
 * needed for.
 */
function or<T>(given: T | null | undefined, fallback: T): T | null {
  return given === undefined ? fallback : given;
}

async function createFixtures(prisma: PrismaService): Promise<Fixtures> {
  const source = await prisma.jobSource.create({
    data: {
      key: SOURCE_KEY,
      displayName: 'Search E2E Feed',
      accessMethod: 'OFFICIAL_FEED',
      attributionText: 'Synthetic e2e data. Not a real job source.',
    },
    select: { id: true },
  });

  const now = Date.now();
  // Distinct timestamps so a tie in rank never decides the order by accident.
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000);

  async function job(
    key: string,
    data: {
      title: string;
      companyName: string;
      language: string;
      description: string;
      postedAt: Date;
      isActive?: boolean;
      // The filterable attributes. `null` is passed explicitly where a fixture
      // has to be unclassified, so `or` distinguishes "not overridden" from
      // "deliberately absent" — the difference the NULL cases turn on.
      location?: string | null;
      countryCode?: string | null;
      workplaceType?: WorkplaceType | null;
      employmentType?: EmploymentType | null;
      technologies?: string[];
      juniorLevel?: JuniorLevel | null;
      juniorScore?: number | null;
      requiredMinYears?: number | null;
      requiredMaxYears?: number | null;
    },
  ): Promise<string> {
    const created = await prisma.job.create({
      data: {
        title: data.title,
        normalizedTitle: data.title.toLowerCase(),
        companyName: data.companyName,
        companySlug: `search-e2e-${key}-${RUN_ID}`,
        location: or(data.location, 'Berlin'),
        countryCode: or(data.countryCode, 'DE'),
        workplaceType: or(data.workplaceType, 'HYBRID'),
        employmentType: or(data.employmentType, 'FULL_TIME'),
        language: data.language,
        description: data.description,
        technologies: data.technologies ?? ['java'],
        dedupHash: `search-e2e-${key}-${RUN_ID}`,
        postedAt: data.postedAt,
        effectivePostedAt: data.postedAt,
        isActive: data.isActive ?? true,
        juniorLevel: or(data.juniorLevel, 'ENTRY_LEVEL'),
        juniorScore: or(data.juniorScore, 90),
        requiredMinYears: or(data.requiredMinYears, 0),
        requiredMaxYears: or(data.requiredMaxYears, 1),
        classifiedAt: data.juniorLevel === null ? null : data.postedAt,
        postings: {
          create: [
            {
              sourceId: source.id,
              externalId: `${key}-${RUN_ID}`,
              url: `https://fixtures.juniorjob.local/${key}/${RUN_ID}`,
              title: data.title,
              companyName: data.companyName,
              companySlug: `search-e2e-${key}-${RUN_ID}`,
              language: data.language,
              description: data.description,
              contentHash: `search-e2e-${key}-${RUN_ID}`,
            },
          ],
        },
      },
      select: { id: true },
    });
    return created.id;
  }

  // German, and deliberately without the query words in verbatim form:
  // "Bewerbungen" is what makes the query "Bewerbung" a stemming result rather
  // than a substring match.
  const germanJobId = await job('de', {
    title: `Junior Softwareentwickler ${RARE_TOKEN} (m/w/d)`,
    companyName: 'Meerbach Technik GmbH',
    language: 'de',
    description:
      'Wir freuen uns auf deine Bewerbungen. Berufseinsteiger sind bei uns ' +
      'willkommen, eine umfassende Einarbeitung ist selbstverstaendlich.',
    postedAt: at(10),
  });

  const titleMatchJobId = await job('title', {
    title: `Graduate ${RARE_TOKEN} Developer`,
    companyName: 'Aurelia Systems Ltd',
    language: 'en',
    description:
      'An entry level role for developers starting their career. You will be ' +
      'developing services with a mentor alongside you.',
    postedAt: at(20),
  });

  const descriptionMatchJobId = await job('description', {
    title: 'Junior Backend Developer',
    companyName: 'Aurelia Systems Ltd',
    language: 'en',
    description:
      `This is an entry level position on the ${RARE_TOKEN} platform team. ` +
      'No professional experience is required.',
    postedAt: at(30),
  });

  const inactiveJobId = await job('inactive', {
    title: `Junior ${RARE_TOKEN} Engineer`,
    companyName: 'Aurelia Systems Ltd',
    language: 'en',
    description: 'An entry level position that is no longer being advertised.',
    postedAt: at(40),
    isActive: false,
  });

  const mergedJobId = await job('merged', {
    title: `Junior ${RARE_TOKEN} Engineer (duplicate)`,
    companyName: 'Aurelia Systems Ltd',
    language: 'en',
    description: 'A duplicate posting of an entry level position.',
    postedAt: at(50),
  });
  await prisma.job.update({
    where: { id: mergedJobId },
    data: { mergedIntoJobId: titleMatchJobId },
  });

  // The filter fixtures. Each differs from the defaults on the axes M9.2 filters
  // by, and all three carry RARE_TOKEN so a filter case can pin the result set to
  // this suite's own rows.
  const remoteJobId = await job('remote', {
    title: `${RARE_TOKEN} Software Engineering Intern`,
    companyName: 'Cloverfield Labs',
    language: 'en',
    description:
      'A remote internship for students and recent graduates. Some exposure to ' +
      'Python is useful but not required.',
    postedAt: at(5),
    location: 'Dublin',
    countryCode: 'IE',
    workplaceType: 'REMOTE',
    employmentType: 'INTERNSHIP',
    technologies: ['python', 'django'],
    juniorLevel: 'LIKELY_ENTRY_LEVEL',
    juniorScore: 72,
    requiredMinYears: null,
    requiredMaxYears: 1,
  });

  // Every M9.2 filter case discriminates against this one rather than against an
  // experienced job, so that no filter assertion can pass merely because M9.3's
  // default result set had already hidden its counter-example.
  const onsiteJobId = await job('onsite', {
    title: `${RARE_TOKEN} Integration Developer`,
    companyName: 'Hollstein Systeme GmbH',
    language: 'en',
    description:
      'You will join an established integration team. Two to four years of ' +
      'professional experience is expected.',
    postedAt: new Date(now - 200 * 24 * 60 * 60_000),
    location: 'Munich',
    workplaceType: 'ONSITE',
    technologies: ['java', 'kotlin'],
    juniorLevel: 'AMBIGUOUS',
    juniorScore: 55,
    requiredMinYears: 2,
    requiredMaxYears: 4,
  });

  // Ingested but never classified, and with no attributes the normalizer could
  // detect. Every NULL-handling decision in the repository is asserted against it.
  const unclassifiedJobId = await job('unclassified', {
    title: `${RARE_TOKEN} Developer`,
    companyName: 'Northgate Interactive',
    language: 'en',
    description: 'A role we have not classified and that states no attributes.',
    postedAt: at(15),
    location: null,
    countryCode: null,
    workplaceType: null,
    employmentType: null,
    technologies: [],
    juniorLevel: null,
    juniorScore: null,
    requiredMinYears: null,
    requiredMaxYears: null,
  });

  // The two bands `PRODUCT.md` §8 keeps out of the default result set. Both are
  // in Hamburg, which nothing else is, so a filter case can prove they are
  // unreachable without naming their level.
  const experiencedJobId = await job('experienced', {
    title: `Senior ${RARE_TOKEN} Platform Engineer`,
    companyName: 'Kestrelbach AG',
    language: 'en',
    description:
      'You will lead a platform team. At least 5 years of professional ' +
      'experience with distributed systems is required.',
    postedAt: at(25),
    location: 'Hamburg',
    juniorLevel: 'EXPERIENCED',
    juniorScore: 30,
    requiredMinYears: 5,
    requiredMaxYears: null,
  });

  const clearlyExperiencedJobId = await job('clearly-experienced', {
    title: `Head of ${RARE_TOKEN} Engineering`,
    companyName: 'Kestrelbach AG',
    language: 'en',
    description:
      'You will own the engineering organisation. At least 10 years of ' +
      'professional experience, including team management, is required.',
    postedAt: at(35),
    location: 'Hamburg',
    juniorLevel: 'CLEARLY_EXPERIENCED',
    juniorScore: 8,
    requiredMinYears: 10,
    requiredMaxYears: null,
  });

  // A pair with identical text — so the rank term cancels — that disagrees about
  // which should come first: the higher score is nearly two years old, the newer
  // one scores lower. `sort=juniorScore` and `sort=relevance` must order them
  // oppositely, which is the only way to show the recency term does real work.
  // A pair differing *only* in age could not: the relevance tiebreak is
  // `effectivePostedAt DESC` too, so both orderings would agree by construction.
  const pairText = {
    title: `${RARE_TOKEN} Applications Developer`,
    companyName: 'Larkfield Digital',
    language: 'en',
    description:
      'An entry level position building internal applications. Training is ' +
      'provided and no professional experience is required.',
  };
  const staleTopScoreId = await job('stale-top-score', {
    ...pairText,
    postedAt: new Date(now - 600 * 24 * 60 * 60_000),
    juniorScore: 95,
  });
  const freshLowerScoreId = await job('fresh-lower-score', {
    ...pairText,
    postedAt: at(1),
    juniorScore: 80,
  });

  // The text term's own pair. The winner carries the query word at weight A and
  // is behind on both other terms — 10 points of junior score and ten days of
  // age — so only the `setweight` difference can put it first. Measured against
  // this schema's vector, a one-word title hit ranks ~0.38 and a description hit
  // ~0.11: a gap of ~0.14 after weighting, against ~0.07 of score and recency
  // deficit. The margin is deliberate, not incidental.
  const titleWeightWinnerId = await job('title-weight-winner', {
    title: `${RARE_TOKEN} Support Developer`,
    companyName: 'Wrenmoor Software',
    language: 'en',
    description:
      'An entry level position maintaining internal tooling. Training is ' +
      'provided and no professional experience is required.',
    postedAt: new Date(now - 10 * 24 * 60 * 60_000),
    juniorScore: 85,
  });

  const titleWeightLoserId = await job('title-weight-loser', {
    title: 'Graduate Support Developer',
    companyName: 'Wrenmoor Software',
    language: 'en',
    description:
      `An entry level position maintaining the ${RARE_TOKEN} tooling. ` +
      'Training is provided and no professional experience is required.',
    postedAt: at(1),
    juniorScore: 95,
  });

  // M9.5's pair. Everything the other three relevance terms read is held equal —
  // same words, same junior score, one minute of age between them — so the only
  // thing that can reorder them is the profile. The python job leads anonymously.
  const fitPairText = {
    title: `${RARE_TOKEN} Platform Developer`,
    companyName: 'Ashgrove Software',
    language: 'en',
    description:
      'An entry level position on a small product team. Training is provided ' +
      'and no professional experience is required.',
  };
  const rustJobId = await job('fit-rust', {
    ...fitPairText,
    postedAt: at(3),
    location: 'Lisbon',
    countryCode: 'PT',
    technologies: ['rust', 'wasm'],
    juniorScore: 80,
  });
  const rubyJobId = await job('fit-ruby', {
    ...fitPairText,
    postedAt: at(4),
    location: 'Vienna',
    countryCode: 'AT',
    technologies: ['ruby', 'rails'],
    juniorScore: 80,
  });

  return {
    sourceId: source.id,
    germanJobId,
    titleMatchJobId,
    descriptionMatchJobId,
    inactiveJobId,
    mergedJobId,
    remoteJobId,
    onsiteJobId,
    unclassifiedJobId,
    experiencedJobId,
    clearlyExperiencedJobId,
    staleTopScoreId,
    freshLowerScoreId,
    titleWeightWinnerId,
    titleWeightLoserId,
    rustJobId,
    rubyJobId,
  };
}
