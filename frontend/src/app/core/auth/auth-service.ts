import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, EMPTY, finalize, Observable, of, shareReplay, tap, throwError } from 'rxjs';
import { AuthApi } from '../api/auth-api';
import { ApiError } from '../models/api-error';
import { AuthTokens, Credentials, CurrentUser } from '../models/auth';
import { TokenStorage } from './token-storage';

/**
 * The session: who is signed in, and the tokens that prove it.
 *
 * State is signals rather than a store or subjects — the whole of it is two
 * tokens and one user object, and a template reads `isAuthenticated()` directly.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly authApi = inject(AuthApi);
  private readonly tokens = inject(TokenStorage);

  private readonly currentUser = signal<CurrentUser | null>(null);

  readonly accessToken = this.tokens.accessToken.asReadonly();
  readonly user = this.currentUser.asReadonly();

  /**
   * Derived from the token's *presence*, not its validity: the client cannot
   * verify a signature, and a token that has expired is still the difference
   * between "show the app" and "show the login form". An expired one is caught
   * on the next request, where the interceptor refreshes it or signs the user out.
   */
  readonly isAuthenticated = computed(() => this.tokens.accessToken() !== null);

  /**
   * The in-flight refresh, shared. Two requests failing with 401 at once must
   * not both spend the refresh token: the second gets this observable, not a
   * second call. Refresh tokens rotate, so a concurrent second call would send
   * an already-spent token and log the user out.
   */
  private refreshInFlight: Observable<AuthTokens> | null = null;

  register(credentials: Credentials): Observable<AuthTokens> {
    return this.authApi.register(credentials).pipe(tap((t) => this.accept(t)));
  }

  login(credentials: Credentials): Observable<AuthTokens> {
    return this.authApi.login(credentials).pipe(tap((t) => this.accept(t)));
  }

  /**
   * Tells the server to revoke the refresh token, then forgets the session
   * locally **whether or not that call succeeds**. A logout that fails because
   * the network is down must still log the user out of this browser; the stored
   * token is what they asked to be rid of.
   */
  logout(): Observable<void> {
    const refreshToken = this.tokens.refreshToken();
    const revoked = refreshToken
      ? this.authApi.logout(refreshToken).pipe(catchError(() => EMPTY))
      : EMPTY;

    return revoked.pipe(finalize(() => this.forget()));
  }

  /**
   * Exchanges the refresh token for a new pair. Called by the interceptor on a
   * 401 — not on a timer, so a session that is idle costs nothing.
   *
   * A failure here is terminal: the refresh token is gone or revoked, so the
   * session is cleared and the error propagates to the request that triggered it.
   */
  refreshTokens(): Observable<AuthTokens> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    const refreshToken = this.tokens.refreshToken();
    if (!refreshToken) {
      this.forget();
      return throwError(
        () => new ApiError(401, ['Your session has expired. Please sign in again.'], null),
      );
    }

    this.refreshInFlight = this.authApi.refresh(refreshToken).pipe(
      tap((t) => this.accept(t)),
      catchError((error: unknown) => {
        this.forget();
        return throwError(() => error);
      }),
      finalize(() => {
        this.refreshInFlight = null;
      }),
      // refCount stays false so a late subscriber gets the completed result
      // rather than re-issuing the request against a spent refresh token.
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.refreshInFlight;
  }

  /**
   * Loads the signed-in account. Returns `null` rather than failing when there
   * is no session, so a caller can ask unconditionally at startup.
   */
  loadCurrentUser(): Observable<CurrentUser | null> {
    if (!this.isAuthenticated()) {
      return of(null);
    }
    return this.authApi.currentUser().pipe(
      tap((user) => this.currentUser.set(user)),
      catchError((error: unknown) => {
        // 401 means the interceptor already tried to refresh and failed; the
        // session is over. Anything else is a transient failure and must not
        // discard a working session.
        if (error instanceof ApiError && error.isUnauthorized) {
          this.forget();
          return of(null);
        }
        return throwError(() => error);
      }),
    );
  }

  private accept(tokens: AuthTokens): void {
    this.tokens.set(tokens);
  }

  /** Drops the session locally. The server is not consulted. */
  private forget(): void {
    this.tokens.clear();
    this.currentUser.set(null);
  }
}
