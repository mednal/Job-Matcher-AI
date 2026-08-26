import { Test, TestingModule } from '@nestjs/testing';
import {
  Controller,
  Get,
  INestApplication,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { Public } from '../src/common/decorators/public.decorator';
import { REQUEST_ID_HEADER } from '../src/common/http/request-id';
import { ErrorResponseBody } from '../src/common/filters/all-exceptions.filter';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Declared here rather than in src/ for the same reason roles.e2e-spec.ts
// declares its admin controller here: M1.4's Verify line needs a route that
// fails the way a bug fails, and shipping one would be shipping a crash
// endpoint. These stand in for any service that throws something the API never
// meant to return.
@Controller('test-errors')
class FailingController {
  @Public()
  @Get('crash')
  crash(): never {
    throw new Error(
      'connect ECONNREFUSED 127.0.0.1:5433\n    at Socket.<anonymous> (net.js:1)',
    );
  }

  // The case the filter exists for: Prisma's messages quote the schema, and a
  // service that forgets to catch one must not be the reason a table name
  // reaches the internet.
  @Public()
  @Get('prisma')
  prismaFailure(): never {
    throw new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`email`)',
      { code: 'P2002', clientVersion: '6.19.3' },
    );
  }
}

function errorBody(res: request.Response): ErrorResponseBody {
  return res.body as ErrorResponseBody;
}

describe('Error envelope (e2e)', () => {
  let app: INestApplication<App>;

  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [FailingController],
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
  });

  describe('every failure answers in one shape', () => {
    it('404 from a route that resolved but found nothing', async () => {
      const res = await request(server())
        .get(`/api/v1/jobs/${randomUUID()}`)
        .expect(404);
      expect(errorBody(res)).toEqual({
        statusCode: 404,
        message: expect.any(String) as string,
        error: 'Not Found',
        requestId: expect.stringMatching(UUID) as string,
      });
    });

    it('401 from the global auth guard, which runs before any interceptor', async () => {
      const res = await request(server()).get('/api/v1/saved-jobs').expect(401);
      expect(errorBody(res)).toEqual({
        statusCode: 401,
        message: 'Missing access token',
        error: 'Unauthorized',
        requestId: expect.stringMatching(UUID) as string,
      });
    });

    it('400 from the validation pipe, one message per invalid field', async () => {
      const res = await request(server())
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: 'short' })
        .expect(400);
      const body = errorBody(res);
      expect(body.statusCode).toBe(400);
      expect(body.error).toBe('Bad Request');
      expect(body.requestId).toMatch(UUID);
      expect(Array.isArray(body.message)).toBe(true);
      expect(body.message.length).toBeGreaterThan(1);
    });

    it('404 from the router, for a path no controller claims', async () => {
      const res = await request(server())
        .get('/api/v1/nothing-here')
        .expect(404);
      expect(errorBody(res).requestId).toMatch(UUID);
    });
  });

  describe('an internal failure leaks nothing', () => {
    beforeEach(() => {
      // The filter logs the stack it withheld; asserting on the response is the
      // point, and printing the stack would only make the run harder to read.
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('a thrown Error becomes a bare 500', async () => {
      const res = await request(server())
        .get('/api/v1/test-errors/crash')
        .expect(500);
      expect(errorBody(res)).toEqual({
        statusCode: 500,
        message: 'Internal server error',
        error: 'Internal Server Error',
        requestId: expect.stringMatching(UUID) as string,
      });
      expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
      expect(JSON.stringify(res.body)).not.toContain('at Socket');
    });

    it('a Prisma error never names the schema', async () => {
      const res = await request(server())
        .get('/api/v1/test-errors/prisma')
        .expect(500);
      const serialized = JSON.stringify(res.body);
      expect(errorBody(res).message).toBe('Internal server error');
      expect(serialized).not.toContain('Unique constraint');
      expect(serialized).not.toContain('email');
      expect(serialized).not.toContain('P2002');
      expect(serialized).not.toContain('Prisma');
    });
  });

  describe('the request id', () => {
    it('is echoed in a header and repeated in the body', async () => {
      const res = await request(server()).get('/api/v1/saved-jobs').expect(401);
      expect(res.headers['x-request-id']).toBe(errorBody(res).requestId);
    });

    it('is on a successful response too, so a caller can quote it either way', async () => {
      const res = await request(server()).get('/api/v1/health').expect(200);
      expect(res.headers['x-request-id']).toMatch(UUID);
    });

    it('keeps the caller’s own id, so one id spans the call', async () => {
      const res = await request(server())
        .get('/api/v1/saved-jobs')
        .set(REQUEST_ID_HEADER, 'frontend-trace-42')
        .expect(401);
      expect(errorBody(res).requestId).toBe('frontend-trace-42');
    });

    // An id that could forge a log line is replaced rather than echoed.
    it('replaces an id it will not repeat into a log', async () => {
      const res = await request(server())
        .get('/api/v1/saved-jobs')
        .set(REQUEST_ID_HEADER, 'id with spaces and "quotes"')
        .expect(401);
      expect(errorBody(res).requestId).toMatch(UUID);
    });

    it('differs between two requests, so a report identifies one of them', async () => {
      const first = await request(server())
        .get('/api/v1/saved-jobs')
        .expect(401);
      const second = await request(server())
        .get('/api/v1/saved-jobs')
        .expect(401);
      expect(errorBody(first).requestId).not.toBe(errorBody(second).requestId);
    });
  });
});
