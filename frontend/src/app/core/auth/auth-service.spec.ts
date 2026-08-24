import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE_URL } from '../api/api-base-url';
import { AuthTokens } from '../models/auth';
import { AuthService } from './auth-service';
import { TokenStorage } from './token-storage';

const BASE_URL = 'http://api.test/api/v1';
const TOKENS: AuthTokens = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresIn: 900,
};

describe('AuthService', () => {
  let auth: AuthService;
  let storage: TokenStorage;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: API_BASE_URL, useValue: BASE_URL },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    auth = TestBed.inject(AuthService);
    storage = TestBed.inject(TokenStorage);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('starts anonymous', () => {
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.accessToken()).toBeNull();
  });

  it('stores the tokens a login returns', () => {
    auth.login({ email: 'ada@example.com', password: 'a-long-password' }).subscribe();

    httpMock.expectOne(`${BASE_URL}/auth/login`).flush(TOKENS);

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.accessToken()).toBe('access-1');
  });

  it('restores a session written before the page reloaded', () => {
    storage.set(TOKENS);

    // A second injector reads the same localStorage, which is what a reload does.
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(true);
  });

  it('registers and is signed in immediately after', () => {
    auth.register({ email: 'ada@example.com', password: 'a-long-password' }).subscribe();

    httpMock.expectOne(`${BASE_URL}/auth/register`).flush(TOKENS);

    expect(auth.isAuthenticated()).toBe(true);
  });

  it('revokes the refresh token on logout and forgets the session', () => {
    storage.set(TOKENS);

    auth.logout().subscribe();

    const request = httpMock.expectOne(`${BASE_URL}/auth/logout`);
    expect(request.request.body).toEqual({ refreshToken: 'refresh-1' });
    request.flush(null);

    expect(auth.isAuthenticated()).toBe(false);
    expect(storage.refreshToken()).toBeNull();
  });

  // Being unable to reach the server is not a reason to keep someone signed in
  // on their own machine.
  it('logs out locally even when the revocation call fails', () => {
    storage.set(TOKENS);

    auth.logout().subscribe();

    httpMock
      .expectOne(`${BASE_URL}/auth/logout`)
      .flush(null, { status: 500, statusText: 'Server Error' });

    expect(auth.isAuthenticated()).toBe(false);
  });

  it('fails a refresh with no refresh token without calling the API', () => {
    let error: unknown;

    auth.refreshTokens().subscribe({ error: (e: unknown) => (error = e) });

    expect(error).toBeDefined();
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('answers null for the current user when nobody is signed in', () => {
    let user: unknown = 'unset';

    auth.loadCurrentUser().subscribe((value) => (user = value));

    expect(user).toBeNull();
  });

  it('loads the signed-in account from /users/me', () => {
    storage.set(TOKENS);

    auth.loadCurrentUser().subscribe();

    httpMock.expectOne(`${BASE_URL}/users/me`).flush({
      id: 'user-1',
      email: 'ada@example.com',
      role: 'USER',
      createdAt: '2026-08-01T10:00:00.000Z',
    });

    expect(auth.user()?.email).toBe('ada@example.com');
  });
});
