import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { toApiError } from '../models/api-error';

/**
 * Turns every `HttpErrorResponse` into an `ApiError`, so no component ever has
 * to know the shape of a NestJS error body.
 *
 * It is registered **first**, which makes it the outermost interceptor: the
 * normalization happens after `authInterceptor` has had its chance to refresh
 * and replay, so that interceptor still sees the raw response it needs to
 * recognise a 401, and a request that recovers never produces an error here at all.
 */
export const errorInterceptor: HttpInterceptorFn = (request, next) =>
  next(request).pipe(
    catchError((error: unknown) =>
      throwError(() => (error instanceof HttpErrorResponse ? toApiError(error) : error)),
    ),
  );
