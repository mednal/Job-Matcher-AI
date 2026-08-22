import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  Controller,
  Get,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { UserRole } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { Roles } from '../src/common/decorators/roles.decorator';
import { Public } from '../src/common/decorators/public.decorator';
import { AuthTokensResponse } from '../src/modules/auth/dto/auth-tokens.response';

const TEST_EMAIL_DOMAIN = 'roles-e2e.test';

function uniqueEmail(label: string): string {
  return `${label}-${randomUUID()}@${TEST_EMAIL_DOMAIN}`;
}

function body<T>(res: request.Response): T {
  return res.body as T;
}

// M3.5's Verify line needs an ADMIN route, and the first real one is M5.5's manual
// ingestion trigger, which does not exist yet. These test-only controllers stand in
// for it so the guard is proven now rather than at M5.5 — they are declared here,
// not in src/, so nothing ships an admin surface the MVP is not supposed to have
// (D4: no admin dashboard, no role-management endpoint).
@Controller('test-admin')
class AdminOnlyController {
  @Get()
  @Roles(UserRole.ADMIN)
  adminOnly(): { ok: boolean } {
    return { ok: true };
  }

  @Get('unrestricted')
  unrestricted(): { ok: boolean } {
    return { ok: true };
  }

  // A contradictory combination: @Public() skips authentication, so no user is
  // attached and @Roles() has nothing to check. It must fail closed.
  @Get('public-but-admin')
  @Public()
  @Roles(UserRole.ADMIN)
  publicButAdmin(): { ok: boolean } {
    return { ok: true };
  }
}

describe('RolesGuard (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userToken: string;
  let adminToken: string;
  let adminUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [AdminOnlyController],
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

    const server = app.getHttpServer();

    const userEmail = uniqueEmail('plain');
    const userRes = await request(server)
      .post('/api/v1/auth/register')
      .send({ email: userEmail, password: 'a-strong-password' })
      .expect(201);
    userToken = body<AuthTokensResponse>(userRes).accessToken;

    const adminEmail = uniqueEmail('admin');
    const adminRes = await request(server)
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'a-strong-password' })
      .expect(201);
    adminToken = body<AuthTokensResponse>(adminRes).accessToken;

    // Promotion is a direct database write on purpose: per D4 there is no
    // role-management endpoint, and this test must not be the reason one appears.
    const promoted = await prisma.user.update({
      where: { email: adminEmail },
      data: { role: UserRole.ADMIN },
      select: { id: true },
    });
    adminUserId = promoted.id;
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

  // The milestone's Verify line.
  it('returns 403 to a USER token on an ADMIN route', async () => {
    await request(server())
      .get('/api/v1/test-admin')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('returns 200 to an ADMIN token on an ADMIN route', async () => {
    await request(server())
      .get('/api/v1/test-admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200, { ok: true });
  });

  // Authentication still comes first: an anonymous caller is 401, not 403, so the
  // guard order has not been inverted.
  it('returns 401, not 403, when no token is sent', async () => {
    await request(server()).get('/api/v1/test-admin').expect(401);
  });

  it('leaves a route without @Roles() reachable by a plain USER', async () => {
    await request(server())
      .get('/api/v1/test-admin/unrestricted')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200, { ok: true });
  });

  it('fails closed on a route that is both @Public() and @Roles()', async () => {
    await request(server())
      .get('/api/v1/test-admin/public-but-admin')
      .expect(403);
  });

  // The role is read from the database on every request, so a demotion takes
  // effect immediately rather than when the 15-minute access token expires. This
  // is the whole reason the guard does not read a role claim off the JWT.
  it('denies a demoted admin still holding a valid access token', async () => {
    await request(server())
      .get('/api/v1/test-admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await prisma.user.update({
      where: { id: adminUserId },
      data: { role: UserRole.USER },
    });

    await request(server())
      .get('/api/v1/test-admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);

    await prisma.user.update({
      where: { id: adminUserId },
      data: { role: UserRole.ADMIN },
    });
  });

  // D4: role is not a user-facing feature. Nothing in the shipped API may change it.
  it('does not expose any route that changes a role', async () => {
    await request(server())
      .put('/api/v1/users/me')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ role: 'ADMIN' })
      .expect(404);

    await request(server())
      .put('/api/v1/profiles/me')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ role: 'ADMIN' })
      .expect(400);
  });
});
