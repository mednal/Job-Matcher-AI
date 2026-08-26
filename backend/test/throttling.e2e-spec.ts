import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { ErrorResponseBody } from '../src/common/filters/all-exceptions.filter';

// setup-e2e.ts turns the limiter off for the rest of the suite; this file is the
// one that wants it on, with limits small enough to reach in a few requests.
// The values are read at module construction, so they are set before compile()
// and restored afterwards — the suite runs in one process.
const AUTH_LIMIT = 3;
const GLOBAL_LIMIT = 20;

const THROTTLE_VARS = [
  'THROTTLE_ENABLED',
  'THROTTLE_TTL_SECONDS',
  'THROTTLE_LIMIT',
  'THROTTLE_AUTH_LIMIT',
] as const;

// Assigning `undefined` to a process.env key stores the string "undefined",
// which the next spec file's Joi schema would then reject. A variable that was
// not set has to be removed, not blanked.
function restore(saved: Record<string, string | undefined>): void {
  for (const key of THROTTLE_VARS) {
    const value = saved[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('Rate limiting (e2e)', () => {
  let app: INestApplication<App>;
  const previous: Record<string, string | undefined> = Object.fromEntries(
    THROTTLE_VARS.map((key) => [key, process.env[key]]),
  );

  const server = () => app.getHttpServer();

  beforeAll(async () => {
    process.env.THROTTLE_ENABLED = 'true';
    process.env.THROTTLE_TTL_SECONDS = '60';
    process.env.THROTTLE_LIMIT = String(GLOBAL_LIMIT);
    process.env.THROTTLE_AUTH_LIMIT = String(AUTH_LIMIT);

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
  });

  afterAll(async () => {
    await app.close();
    restore(previous);
  });

  // A wrong password is what a credential-guessing run looks like, and it is
  // stopped by the count of attempts rather than by anything about the account.
  it('stops guessing at /auth/* after the stricter limit', async () => {
    const credentials = {
      email: `throttle-${randomUUID()}@throttling-e2e.test`,
      password: 'not-the-password',
    };

    for (let attempt = 0; attempt < AUTH_LIMIT; attempt += 1) {
      await request(server())
        .post('/api/v1/auth/login')
        .send(credentials)
        .expect(401);
    }

    const blocked = await request(server())
      .post('/api/v1/auth/login')
      .send(credentials)
      .expect(429);

    // The 429 is normalized by the same filter as every other failure, so a
    // client parses one shape (M1.4).
    const body = blocked.body as ErrorResponseBody;
    expect(body).toEqual({
      statusCode: 429,
      message: 'Too many requests. Please try again later.',
      error: 'Too Many Requests',
      requestId: expect.any(String) as string,
    });
  });

  // The stricter limit belongs to /auth/* alone: a reader browsing jobs must not
  // be cut off after three requests because someone chose that number for logins.
  it('does not apply the auth limit to the rest of the API', async () => {
    for (let attempt = 0; attempt < AUTH_LIMIT + 1; attempt += 1) {
      await request(server()).get('/api/v1/jobs').expect(200);
    }
  });

  it('applies the global limit to the rest of the API', async () => {
    // The loop above has already spent part of the window from this address.
    let sawTooMany = false;
    for (
      let attempt = 0;
      attempt < GLOBAL_LIMIT + 5 && !sawTooMany;
      attempt += 1
    ) {
      const res = await request(server()).get('/api/v1/jobs');
      sawTooMany = res.status === 429;
    }
    expect(sawTooMany).toBe(true);
  });

  // Liveness is polled by whatever runs the deployment, and a probe answered
  // with 429 would report a healthy application as down.
  it('never rate-limits the health check', async () => {
    for (let attempt = 0; attempt < GLOBAL_LIMIT + 5; attempt += 1) {
      await request(server()).get('/api/v1/health').expect(200);
    }
  });
});
