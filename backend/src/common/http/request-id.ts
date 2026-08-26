import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';

// A request id is echoed back to the client and written into every log line, so
// what a caller may put in it is restricted: an unbounded header would let a
// client forge log entries or inject control characters into them.
const ACCEPTABLE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export interface RequestWithId extends Request {
  requestId?: string;
}

// Reuses the caller's id when it is safe to echo, so a frontend that already
// correlates a request keeps one id end to end; otherwise mints a fresh one.
export function resolveRequestId(incoming: string | undefined): string {
  return incoming !== undefined && ACCEPTABLE_REQUEST_ID.test(incoming)
    ? incoming
    : randomUUID();
}

// Undefined only for a request that never passed through RequestIdMiddleware,
// which in practice means a unit test constructing its own context.
export function getRequestId(request: unknown): string | undefined {
  const candidate = (request as RequestWithId | undefined)?.requestId;
  return typeof candidate === 'string' ? candidate : undefined;
}
