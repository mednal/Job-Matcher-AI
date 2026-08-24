import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../auth/auth-service';

/**
 * Requests that must never carry an access token, because they are how one is
 * obtained. `/auth/logout` is absent on purpose: it is authenticated, and the
 * backend scopes the revocation to the calling user.
 */
const UNAUTHENTICATED_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

/**
 * Attaches the access token, and on a 401 refreshes **once** and replays the
 * request.
 *
 * The retry is issued through `next` directly rather than through `HttpClient`,
 * so it does not re-enter this interceptor. That is what makes "once" structural
 * instead of a counter someone has to maintain: a second 401 on the replayed
 * request has nowhere to recurse to and propagates to the caller.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);

  if (isUnauthenticatedPath(request.url)) {
    return next(request);
  }

  const accessToken = auth.accessToken();
  const authenticated = accessToken ? withBearer(request, accessToken) : request;

  return next(authenticated).pipe(
    catchError((error: unknown) => {
      // Only a request that *was* authenticated is worth retrying. A 401 on an
      // anonymous request means the route requires a login, not that a token
      // went stale, and refreshing on it would sign the user out of nothing.
      if (!accessToken || !isUnauthorized(error)) {
        return throwError(() => error);
      }

      return auth
        .refreshTokens()
        .pipe(switchMap((tokens) => next(withBearer(request, tokens.accessToken))));
    }),
  );
};

function isUnauthenticatedPath(url: string): boolean {
  return UNAUTHENTICATED_PATHS.some((path) => url.includes(path));
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 401;
}

function withBearer<T>(request: HttpRequest<T>, accessToken: string): HttpRequest<T> {
  return request.clone({
    setHeaders: { Authorization: `Bearer ${accessToken}` },
  });
}
