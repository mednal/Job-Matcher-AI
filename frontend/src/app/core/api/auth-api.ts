import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api-base-url';
import { AuthTokens, Credentials, CurrentUser } from '../models/auth';

/**
 * `POST /auth/*` plus `GET /users/me`.
 *
 * Transport only — no state. Where the tokens are kept and when they are
 * refreshed is `AuthService`'s business, which keeps this class trivially
 * testable and lets the interceptor drive a refresh without owning the request.
 */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  register(credentials: Credentials): Observable<AuthTokens> {
    return this.http.post<AuthTokens>(`${this.baseUrl}/auth/register`, credentials);
  }

  login(credentials: Credentials): Observable<AuthTokens> {
    return this.http.post<AuthTokens>(`${this.baseUrl}/auth/login`, credentials);
  }

  /**
   * Refresh tokens rotate: the response carries a *new* refresh token and the
   * one sent here is spent. Storing the response is therefore mandatory, not an
   * optimization — dropping it logs the user out at the next refresh.
   */
  refresh(refreshToken: string): Observable<AuthTokens> {
    return this.http.post<AuthTokens>(`${this.baseUrl}/auth/refresh`, {
      refreshToken,
    });
  }

  /** 204, and requires the access token — logout is something an account does. */
  logout(refreshToken: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/auth/logout`, {
      refreshToken,
    });
  }

  /**
   * `GET /users/me`. It lives here rather than in a one-route `UsersApi`
   * because the only thing that ever asks for it is the authenticated session
   * describing itself.
   */
  currentUser(): Observable<CurrentUser> {
    return this.http.get<CurrentUser>(`${this.baseUrl}/users/me`);
  }
}
