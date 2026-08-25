import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AllExceptionsFilter,
  ErrorResponseBody,
} from './all-exceptions.filter';

interface Captured {
  status: number;
  body: ErrorResponseBody;
}

// `null` means "this request never passed RequestIdMiddleware", which is not the
// same as passing `undefined` — that would only re-select the default.
function run(exception: unknown, requestId: string | null = 'req-1'): Captured {
  const captured = {} as Captured;
  const response = {
    status: (status: number) => {
      captured.status = status;
      return response;
    },
    json: (body: ErrorResponseBody) => {
      captured.body = body;
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({
        ...(requestId === null ? {} : { requestId }),
        method: 'GET',
        originalUrl: '/api/v1/jobs',
      }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter().catch(exception, host);
  return captured;
}

describe('AllExceptionsFilter', () => {
  beforeEach(() => {
    // The filter logs what it does not send; the assertions are about the
    // response, and a spec should not print stack traces to be readable.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('answers an HttpException with its own status, message and error', () => {
    const { status, body } = run(new NotFoundException('Job not found'));
    expect(status).toBe(404);
    expect(body).toEqual({
      statusCode: 404,
      message: 'Job not found',
      error: 'Not Found',
      requestId: 'req-1',
    });
  });

  // The frontend's `toApiError` renders one message per invalid field, so the
  // array ValidationPipe produces has to survive the filter intact.
  it('keeps the validation message array', () => {
    const { body } = run(
      new BadRequestException([
        'email must be an email',
        'password is too short',
      ]),
    );
    expect(body.message).toEqual([
      'email must be an email',
      'password is too short',
    ]);
    expect(body.error).toBe('Bad Request');
  });

  it('names the status when the exception carried no `error`', () => {
    const { body } = run(
      new HttpException('nope', HttpStatus.TOO_MANY_REQUESTS),
    );
    expect(body).toEqual({
      statusCode: 429,
      message: 'nope',
      error: 'Too Many Requests',
      requestId: 'req-1',
    });
  });

  it('leaves an unauthenticated request indistinguishable from any other', () => {
    const { status, body } = run(new UnauthorizedException());
    expect(status).toBe(401);
    expect(body.message).toBe('Unauthorized');
  });

  // The point of the filter: nothing that is not an HttpException reaches the
  // client as anything but a generic 500, so there is no per-service list of
  // internal error types to keep up to date.
  describe('never leaks an internal failure', () => {
    const internal: [string, unknown][] = [
      [
        'a plain Error with a stack',
        new Error('connect ECONNREFUSED 127.0.0.1:5433'),
      ],
      [
        'a Prisma error naming a column',
        new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`email`)',
          { code: 'P2002', clientVersion: '6.19.3' },
        ),
      ],
      ['a thrown string', 'boom'],
      ['a thrown object', { secret: 'value' }],
    ];

    it.each(internal)('%s becomes a bare 500', (_label, exception) => {
      const { status, body } = run(exception);
      expect(status).toBe(500);
      expect(body).toEqual({
        statusCode: 500,
        message: 'Internal server error',
        error: 'Internal Server Error',
        requestId: 'req-1',
      });
    });

    it('logs the detail it withheld, against the same request id', () => {
      const error = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      run(new Error('connect ECONNREFUSED 127.0.0.1:5433'));
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'req-1', statusCode: 500 }),
        expect.stringContaining('connect ECONNREFUSED'),
      );
    });
  });

  it('omits requestId rather than inventing one when there is none', () => {
    const { body } = run(new NotFoundException('Job not found'), null);
    expect(body).not.toHaveProperty('requestId');
  });
});
