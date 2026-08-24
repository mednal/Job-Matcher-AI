import { HttpErrorResponse } from '@angular/common/http';

/**
 * Every failed request reaches a component as one of these, so no caller has to
 * know the shape of a NestJS error body — or that the failure came from HTTP at
 * all. `errorInterceptor` is the only place that constructs one.
 */
export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 when the request never reached the server. */
    readonly status: number,
    /**
     * Every message the server sent. A validation failure returns one entry per
     * violated rule, and a form needs all of them, so the array is kept and
     * `message` is only its first line.
     */
    readonly messages: string[],
    readonly url: string | null,
  ) {
    super(messages[0] ?? 'Request failed');
    this.name = 'ApiError';
  }

  /** No connection, DNS failure, CORS rejection — the request never landed. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** A 400 from `ValidationPipe`, which is the only error a form can act on. */
  get isValidationError(): boolean {
    return this.status === 400;
  }
}

/**
 * NestJS answers `{ statusCode, message, error }`, where `message` is a string
 * for a thrown exception and a string[] for a validation failure. Both shapes
 * are read, and anything else falls back to the status text rather than
 * rendering `[object Object]` at the user.
 */
export function toApiError(response: HttpErrorResponse): ApiError {
  return new ApiError(response.status, extractMessages(response), response.url);
}

function extractMessages(response: HttpErrorResponse): string[] {
  const body: unknown = response.error;

  if (typeof body === 'string' && body.trim().length > 0) {
    return [body];
  }

  if (typeof body === 'object' && body !== null) {
    const message: unknown = (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return [message];
    }
    if (Array.isArray(message)) {
      const entries = message.filter((entry): entry is string => typeof entry === 'string');
      if (entries.length > 0) {
        return entries;
      }
    }
  }

  if (response.status === 0) {
    return ['Cannot reach the server. Check your connection and try again.'];
  }

  return [response.statusText || 'Request failed'];
}
