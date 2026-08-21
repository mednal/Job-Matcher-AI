import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AuthTokensResponse } from '../src/modules/auth/dto/auth-tokens.response';
import { UserResponse } from '../src/modules/users/dto/user.response';

// Every user created by this suite uses this domain, so cleanup can target
// exactly its own rows in the shared local dev database without disturbing
// anything else.
const TEST_EMAIL_DOMAIN = 'auth-e2e.test';

function uniqueEmail(label: string): string {
  return `${label}-${randomUUID()}@${TEST_EMAIL_DOMAIN}`;
}

// supertest types response.body as `any`; narrow it to the DTO the endpoint
// actually returns so assertions stay type-checked.
function body<T>(res: request.Response): T {
  return res.body as T;
}

interface ErrorResponseBody {
  message: unknown;
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

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
  });

  afterAll(async () => {
    const testUsers = await prisma.user.findMany({
      where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
      select: { id: true },
    });
    const ids = testUsers.map((u) => u.id);
    if (ids.length > 0) {
      await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app.close();
  });

  const server = () => app.getHttpServer();

  describe('POST /auth/register', () => {
    it('creates an account and returns a token pair', async () => {
      const email = uniqueEmail('register');
      const res = await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: 'a-strong-password' })
        .expect(201);

      const tokens = body<AuthTokensResponse>(res);
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
      expect(typeof tokens.expiresIn).toBe('number');
    });

    it('rejects a duplicate email with 409', async () => {
      const email = uniqueEmail('dup');
      await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: 'a-strong-password' })
        .expect(201);

      await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: 'another-strong-password' })
        .expect(409);
    });

    it('rejects the same email in different casing as a duplicate', async () => {
      const email = uniqueEmail('case');
      await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: 'a-strong-password' })
        .expect(201);

      await request(server())
        .post('/api/v1/auth/register')
        .send({
          email: email.toUpperCase(),
          password: 'another-strong-password',
        })
        .expect(409);
    });

    it('rejects a password shorter than the minimum', async () => {
      await request(server())
        .post('/api/v1/auth/register')
        .send({ email: uniqueEmail('short'), password: 'short' })
        .expect(400);
    });

    it('rejects a malformed email', async () => {
      await request(server())
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: 'a-strong-password' })
        .expect(400);
    });

    it('rejects an attempt to set role via the request body', async () => {
      const email = uniqueEmail('role');
      const res = await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: 'a-strong-password', role: 'ADMIN' })
        .expect(400);

      expect(body<ErrorResponseBody>(res).message).toBeDefined();

      // Confirm no user was created with that payload.
      const created = await prisma.user.findUnique({ where: { email } });
      expect(created).toBeNull();
    });
  });

  describe('POST /auth/login', () => {
    it('returns identical 401 bodies for unknown email and wrong password', async () => {
      const email = uniqueEmail('login');
      await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: 'correct-password' })
        .expect(201);

      const wrongPassword = await request(server())
        .post('/api/v1/auth/login')
        .send({ email, password: 'wrong-password' })
        .expect(401);

      const unknownEmail = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: uniqueEmail('ghost'), password: 'wrong-password' })
        .expect(401);

      expect(wrongPassword.body).toEqual(unknownEmail.body);
    });

    it('returns tokens on correct credentials', async () => {
      const email = uniqueEmail('login-ok');
      await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: 'correct-password' })
        .expect(201);

      const res = await request(server())
        .post('/api/v1/auth/login')
        .send({ email, password: 'correct-password' })
        .expect(200);

      const tokens = body<AuthTokensResponse>(res);
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
    });
  });

  describe('GET /users/me', () => {
    it('rejects a request with no token', async () => {
      await request(server()).get('/api/v1/users/me').expect(401);
    });

    it('rejects a tampered token', async () => {
      await request(server())
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });

    it('returns the current user for a valid token, without passwordHash', async () => {
      const email = uniqueEmail('me');
      const register = await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: 'a-strong-password' })
        .expect(201);
      const { accessToken } = body<AuthTokensResponse>(register);

      const res = await request(server())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const me = body<UserResponse & { passwordHash?: unknown }>(res);
      expect(me.email).toBe(email);
      expect(me.role).toBe('USER');
      expect(me.passwordHash).toBeUndefined();
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the refresh token and rejects reuse of the old one', async () => {
      const email = uniqueEmail('refresh');
      const register = await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: 'a-strong-password' })
        .expect(201);
      const { refreshToken: originalRefreshToken } =
        body<AuthTokensResponse>(register);

      const firstRefresh = await request(server())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: originalRefreshToken })
        .expect(200);

      const { refreshToken: rotatedOnce } =
        body<AuthTokensResponse>(firstRefresh);
      expect(rotatedOnce).not.toEqual(originalRefreshToken);

      // Reusing the already-rotated token must fail (M3.4 Verify: line).
      await request(server())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: originalRefreshToken })
        .expect(401);
    });

    it('reuse of a rotated token also revokes the token it was rotated into', async () => {
      const email = uniqueEmail('reuse');
      const register = await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: 'a-strong-password' })
        .expect(201);
      const { refreshToken: originalRefreshToken } =
        body<AuthTokensResponse>(register);

      const firstRefresh = await request(server())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: originalRefreshToken })
        .expect(200);
      const { refreshToken: rotatedToken } =
        body<AuthTokensResponse>(firstRefresh);

      // Reuse of the original (now-revoked) token triggers revoke-all.
      await request(server())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: originalRefreshToken })
        .expect(401);

      // The token that reuse rotated into is now also revoked.
      await request(server())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: rotatedToken })
        .expect(401);
    });

    it('rejects an unknown refresh token', async () => {
      await request(server())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'not-a-real-refresh-token' })
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the refresh token so it can no longer be used', async () => {
      const email = uniqueEmail('logout');
      const register = await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: 'a-strong-password' })
        .expect(201);
      const { accessToken, refreshToken } = body<AuthTokensResponse>(register);

      await request(server())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(204);

      await request(server())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('requires authentication', async () => {
      await request(server())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: 'irrelevant' })
        .expect(401);
    });
  });

  describe('GET /health', () => {
    it('remains reachable without a token after the global guard is registered', async () => {
      await request(server()).get('/api/v1/health').expect(200);
    });
  });
});
