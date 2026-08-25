import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import {
  REQUEST_ID_HEADER,
  RequestWithId,
  resolveRequestId,
} from '../http/request-id';

// Middleware rather than an interceptor, and that is the whole point of the
// choice: Nest runs middleware -> guards -> interceptors, so an interceptor
// would not have run yet when the global JwtAuthGuard rejects a request. A 401
// is the most common error this API returns, and it has to carry a request id
// like any other. The same ordering is why the access line is written from
// `finish` rather than from an interceptor's tap: `finish` fires for every
// response — handler, guard, throttler, or the 404 the router itself produces —
// exactly once.
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger('http');

  use(request: RequestWithId, response: Response, next: NextFunction): void {
    const requestId = resolveRequestId(request.header(REQUEST_ID_HEADER));
    request.requestId = requestId;
    // Echoed so a caller can quote the id of a request that failed without
    // having to have logged it themselves.
    response.setHeader(REQUEST_ID_HEADER, requestId);

    const startedAt = process.hrtime.bigint();
    response.on('finish', () => {
      this.logger.log({
        message: 'request',
        requestId,
        method: request.method,
        // `originalUrl`, so the line says what was actually asked for, prefix
        // and query string included.
        url: request.originalUrl,
        statusCode: response.statusCode,
        durationMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
      });
    });

    next();
  }
}
