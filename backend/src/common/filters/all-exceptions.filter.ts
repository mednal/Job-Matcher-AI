import { STATUS_CODES } from 'node:http';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { RequestWithId, getRequestId } from '../http/request-id';

// docs/ARCHITECTURE.md §12. `message` keeps NestJS's own shape — a string, or
// the array class-validator produces — because the frontend's `toApiError`
// already reads both and field-level validation messages are the useful part of
// a 400.
export interface ErrorResponseBody {
  statusCode: number;
  message: string | string[];
  error: string;
  requestId?: string;
}

interface NormalizedError {
  status: number;
  message: string | string[];
  error: string;
}

// The lowest status that means "this is ours, not the caller's".
const SERVER_ERROR_FLOOR = 500;

const statusText = (status: number): string => STATUS_CODES[status] ?? 'Error';

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

// Anything that is not an HttpException is a bug or an infrastructure failure,
// and the client is told nothing about it beyond the status. That is what keeps
// stack traces and Prisma messages — which quote table and column names — out of
// the response *by construction* rather than by remembering to catch Prisma
// errors in every service.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const requestId = getRequestId(request);

    const { status, message, error } = normalize(exception);

    this.record(exception, status, requestId, request);

    const body: ErrorResponseBody = { statusCode: status, message, error };
    if (requestId !== undefined) {
      body.requestId = requestId;
    }
    response.status(status).json(body);
  }

  // The detail the client is not given is the detail the operator needs, so a
  // 5xx is logged with its stack against the same request id the caller was
  // handed back. A 4xx is the client's own doing and is logged at warn without
  // one — an expected 401 is not an incident.
  private record(
    exception: unknown,
    status: number,
    requestId: string | undefined,
    request: RequestWithId,
  ): void {
    const where = {
      requestId,
      method: request.method,
      url: request.originalUrl,
    };
    if (status >= SERVER_ERROR_FLOOR) {
      this.logger.error(
        { message: 'unhandled exception', statusCode: status, ...where },
        exception instanceof Error ? exception.stack : String(exception),
      );
      return;
    }
    this.logger.warn({
      message: 'request rejected',
      statusCode: status,
      ...where,
      reason:
        exception instanceof Error ? exception.message : String(exception),
    });
  }
}

function normalize(exception: unknown): NormalizedError {
  if (!(exception instanceof HttpException)) {
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: statusText(HttpStatus.INTERNAL_SERVER_ERROR),
    };
  }

  const status = exception.getStatus();
  const payload = exception.getResponse();

  if (typeof payload === 'string') {
    return { status, message: payload, error: statusText(status) };
  }

  const body = payload as Record<string, unknown>;
  const message =
    typeof body.message === 'string' || isStringArray(body.message)
      ? body.message
      : exception.message;

  return {
    status,
    message,
    error: typeof body.error === 'string' ? body.error : statusText(status),
  };
}
