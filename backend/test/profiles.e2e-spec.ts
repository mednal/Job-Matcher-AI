import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { WorkplaceType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AuthTokensResponse } from '../src/modules/auth/dto/auth-tokens.response';
import { ProfileResponse } from '../src/modules/profiles/dto/profile.response';

const TEST_EMAIL_DOMAIN = 'profiles-e2e.test';

function uniqueEmail(label: string): string {
  return `${label}-${randomUUID()}@${TEST_EMAIL_DOMAIN}`;
}

function body<T>(res: request.Response): T {
  return res.body as T;
}

describe('Profiles (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  // Two independent accounts — the ownership assertions need a second user whose
  // profile is populated differently.
  let tokenA: string;
  let tokenB: string;
  let userIdB: string;

  async function register(
    label: string,
  ): Promise<{ token: string; userId: string }> {
    const email = uniqueEmail(label);
    const res = await request(app.getHttpServer())
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

    tokenA = (await register('user-a')).token;
    const b = await register('user-b');
    tokenB = b.token;
    userIdB = b.userId;
  });

  afterAll(async () => {
    const testUsers = await prisma.user.findMany({
      where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
      select: { id: true },
    });
    const ids = testUsers.map((u) => u.id);
    if (ids.length > 0) {
      // Profile cascades on user delete, but delete it explicitly so the suite
      // leaves nothing behind even if the relation changes.
      await prisma.profile.deleteMany({ where: { userId: { in: ids } } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app.close();
  });

  const server = () => app.getHttpServer();

  describe('authentication', () => {
    it('401s on GET without a token', async () => {
      await request(server()).get('/api/v1/profiles/me').expect(401);
    });

    it('401s on PUT without a token', async () => {
      await request(server()).put('/api/v1/profiles/me').send({}).expect(401);
    });
  });

  describe('GET /profiles/me', () => {
    // Registration creates no Profile row; a brand-new account must still be able
    // to render a profile form without special-casing a 404.
    it('returns an empty profile for an account that has never saved one', async () => {
      const { token } = await register('never-saved');
      const res = await request(server())
        .get('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(body<ProfileResponse>(res)).toEqual({
        displayName: null,
        yearsOfExperience: 0,
        desiredRoles: [],
        technologies: [],
        locations: [],
        countryCodes: [],
        workplaceTypes: [],
        updatedAt: null,
      });
    });

    it('never exposes the profile id or userId', async () => {
      const { token } = await register('no-ids');
      await request(server())
        .put('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'Someone' })
        .expect(200);

      const res = await request(server())
        .get('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).not.toHaveProperty('id');
      expect(res.body).not.toHaveProperty('userId');
      expect(res.body).not.toHaveProperty('user');
    });
  });

  describe('PUT /profiles/me', () => {
    it('creates the profile on first write and reads back identically', async () => {
      const { token } = await register('first-write');
      const payload = {
        displayName: 'Jane Doe',
        yearsOfExperience: 1,
        desiredRoles: ['Java Developer'],
        technologies: ['java', 'spring-boot'],
        locations: ['Berlin'],
        countryCodes: ['DE'],
        workplaceTypes: [WorkplaceType.REMOTE],
      };

      const put = await request(server())
        .put('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send(payload)
        .expect(200);

      const written = body<ProfileResponse>(put);
      expect(written).toMatchObject(payload);
      expect(written.updatedAt).not.toBeNull();

      const get = await request(server())
        .get('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(body<ProfileResponse>(get)).toEqual(written);
    });

    it('canonicalizes technologies and country codes on write', async () => {
      const { token } = await register('canonical');
      const res = await request(server())
        .put('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ technologies: ['Spring Boot', 'JAVA'], countryCodes: ['de'] })
        .expect(200);

      const profile = body<ProfileResponse>(res);
      expect(profile.technologies).toEqual(['spring-boot', 'java']);
      expect(profile.countryCodes).toEqual(['DE']);
    });

    // PUT replaces. Without this, an omitted list could never be cleared, because
    // the API surface offers no PATCH for this resource.
    it('clears omitted fields instead of merging them', async () => {
      const { token } = await register('replace');
      await request(server())
        .put('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Jane',
          yearsOfExperience: 2,
          technologies: ['java'],
          locations: ['Berlin'],
        })
        .expect(200);

      const res = await request(server())
        .put('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ technologies: ['python'] })
        .expect(200);

      const profile = body<ProfileResponse>(res);
      expect(profile.technologies).toEqual(['python']);
      expect(profile.displayName).toBeNull();
      expect(profile.yearsOfExperience).toBe(0);
      expect(profile.locations).toEqual([]);
    });

    it('accepts an empty body as a full reset', async () => {
      const { token } = await register('reset');
      await request(server())
        .put('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'Jane', technologies: ['java'] })
        .expect(200);

      const res = await request(server())
        .put('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(200);

      const profile = body<ProfileResponse>(res);
      expect(profile.displayName).toBeNull();
      expect(profile.technologies).toEqual([]);
    });

    it('writes exactly one row however many times it is called', async () => {
      const { token, userId } = await register('single-row');
      for (const name of ['One', 'Two', 'Three']) {
        await request(server())
          .put('/api/v1/profiles/me')
          .set('Authorization', `Bearer ${token}`)
          .send({ displayName: name })
          .expect(200);
      }

      const count = await prisma.profile.count({ where: { userId } });
      expect(count).toBe(1);
    });
  });

  describe('validation', () => {
    it('400s on yearsOfExperience above the database CHECK bound', async () => {
      await request(server())
        .put('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ yearsOfExperience: 61 })
        .expect(400);
    });

    it('400s on a negative yearsOfExperience', async () => {
      await request(server())
        .put('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ yearsOfExperience: -1 })
        .expect(400);
    });

    it('400s on an invalid country code', async () => {
      await request(server())
        .put('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ countryCodes: ['GER'] })
        .expect(400);
    });

    it('400s on an unknown workplace type', async () => {
      await request(server())
        .put('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ workplaceTypes: ['ANYWHERE'] })
        .expect(400);
    });

    it('400s on an undeclared property', async () => {
      await request(server())
        .put('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ userId: randomUUID() })
        .expect(400);
    });

    it('400s on a list longer than the cap', async () => {
      await request(server())
        .put('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ locations: Array.from({ length: 51 }, (_, i) => `city-${i}`) })
        .expect(400);
    });
  });

  // The milestone's Verify line: user A cannot reach user B's profile.
  describe('ownership', () => {
    beforeAll(async () => {
      await request(server())
        .put('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ displayName: 'Owner A', technologies: ['java'] })
        .expect(200);

      await request(server())
        .put('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ displayName: 'Owner B', technologies: ['python'] })
        .expect(200);
    });

    it('serves each token its own profile, keyed by the token subject', async () => {
      const a = await request(server())
        .get('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const b = await request(server())
        .get('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(body<ProfileResponse>(a).displayName).toBe('Owner A');
      expect(body<ProfileResponse>(b).displayName).toBe('Owner B');
    });

    it('a write by A cannot touch the profile owned by B', async () => {
      await request(server())
        .put('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ displayName: 'A overwrote B' })
        .expect(200);

      const b = await request(server())
        .get('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(body<ProfileResponse>(b).displayName).toBe('Owner B');
    });

    // There is no route that names another user's profile, so the attempt cannot
    // even be spelled — it 404s at routing, before any handler sees it.
    it('exposes no route addressing a profile by id or userId', async () => {
      await request(server())
        .get(`/api/v1/profiles/${userIdB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);

      await request(server())
        .put(`/api/v1/profiles/${userIdB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ displayName: 'hijacked' })
        .expect(404);
    });

    it('ignores a userId smuggled in the query string', async () => {
      const res = await request(server())
        .get('/api/v1/profiles/me')
        .query({ userId: userIdB })
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(body<ProfileResponse>(res).displayName).toBe('A overwrote B');
    });
  });
});
