import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE_URL } from '../api/api-base-url';
import { ApiError } from '../models/api-error';
import { AuthTokens } from '../models/auth';
import { AuthService } from '../auth/auth-service';
import { TokenStorage } from '../auth/token-storage';
import { authInterceptor } from './auth-interceptor';
import { errorInterceptor } from './error-interceptor';

const BASE_URL = 'http://api.test/api/v1';

function tokens(suffix: string): AuthTokens {
  return {
    accessToken: `access-${suffix}`,
    refreshToken: `refresh-${suffix}`,
    expiresIn: 900,
  };
}

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let storage: TokenStorage;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: API_BASE_URL, useValue: BASE_URL },
        provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    storage = TestBed.inject(TokenStorage);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  describe('token attachment', () => {
    it('attaches the access token as a bearer header', () => {
      storage.set(tokens('1'));

      http.get(`${BASE_URL}/saved-jobs`).subscribe();

      const request = httpMock.expectOne(`${BASE_URL}/saved-jobs`);
      expect(request.request.headers.get('Authorization')).toBe('Bearer access-1');
      request.flush({ items: [], page: 1, pageSize: 20, total: 0 });
    });

    it('sends no Authorization header when there is no session', () => {
      http.get(`${BASE_URL}/jobs/search`).subscribe();

      const request = httpMock.expectOne(`${BASE_URL}/jobs/search`);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({ items: [], page: 1, pageSize: 20, total: 0 });
    });

    // Sending a stale token to /auth/login would be pointless at best, and the
    // refresh call must never carry the access token it exists to replace.
    for (const path of ['/auth/login', '/auth/register', '/auth/refresh']) {
      it(`never attaches the token to ${path}`, () => {
        storage.set(tokens('1'));

        http.post(`${BASE_URL}${path}`, {}).subscribe();

        const request = httpMock.expectOne(`${BASE_URL}${path}`);
        expect(request.request.headers.has('Authorization')).toBe(false);
        request.flush(tokens('2'));
      });
    }

    it('attaches the token to logout, which is authenticated', () => {
      storage.set(tokens('1'));

      http.post(`${BASE_URL}/auth/logout`, { refreshToken: 'refresh-1' }).subscribe();

      const request = httpMock.expectOne(`${BASE_URL}/auth/logout`);
      expect(request.request.headers.get('Authorization')).toBe('Bearer access-1');
      request.flush(null);
    });
  });

  describe('refresh on 401', () => {
    it('refreshes once and replays the request with the new token', () => {
      storage.set(tokens('1'));
      let body: unknown;

      http.get(`${BASE_URL}/profiles/me`).subscribe((response) => (body = response));

      httpMock
        .expectOne(`${BASE_URL}/profiles/me`)
        .flush(
          { statusCode: 401, message: 'Unauthorized' },
          { status: 401, statusText: 'Unauthorized' },
        );

      const refresh = httpMock.expectOne(`${BASE_URL}/auth/refresh`);
      expect(refresh.request.body).toEqual({ refreshToken: 'refresh-1' });
      refresh.flush(tokens('2'));

      const replayed = httpMock.expectOne(`${BASE_URL}/profiles/me`);
      expect(replayed.request.headers.get('Authorization')).toBe('Bearer access-2');
      replayed.flush({ displayName: 'Ada' });

      expect(body).toEqual({ displayName: 'Ada' });
      // Rotation: the new refresh token must have been stored, or the next
      // refresh would spend one the server has already retired.
      expect(storage.refreshToken()).toBe('refresh-2');
    });

    it('gives up rather than looping when the replayed request is also rejected', () => {
      storage.set(tokens('1'));
      let error: unknown;

      http.get(`${BASE_URL}/profiles/me`).subscribe({ error: (e: unknown) => (error = e) });

      httpMock
        .expectOne(`${BASE_URL}/profiles/me`)
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      httpMock.expectOne(`${BASE_URL}/auth/refresh`).flush(tokens('2'));
      httpMock
        .expectOne(`${BASE_URL}/profiles/me`)
        .flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(401);
    });

    it('refreshes only once for two requests that fail together', () => {
      storage.set(tokens('1'));

      http.get(`${BASE_URL}/profiles/me`).subscribe();
      http.get(`${BASE_URL}/saved-jobs`).subscribe();

      for (const url of [`${BASE_URL}/profiles/me`, `${BASE_URL}/saved-jobs`]) {
        httpMock.expectOne(url).flush(null, { status: 401, statusText: 'Unauthorized' });
      }

      // One refresh, not two: the second 401 joins the in-flight call instead of
      // spending the rotated token a second time.
      httpMock.expectOne(`${BASE_URL}/auth/refresh`).flush(tokens('2'));

      for (const url of [`${BASE_URL}/profiles/me`, `${BASE_URL}/saved-jobs`]) {
        const replayed = httpMock.expectOne(url);
        expect(replayed.request.headers.get('Authorization')).toBe('Bearer access-2');
        replayed.flush({});
      }
    });

    it('clears the session when the refresh token is rejected', () => {
      storage.set(tokens('1'));
      let error: unknown;

      http.get(`${BASE_URL}/saved-jobs`).subscribe({ error: (e: unknown) => (error = e) });

      httpMock
        .expectOne(`${BASE_URL}/saved-jobs`)
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      httpMock
        .expectOne(`${BASE_URL}/auth/refresh`)
        .flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(error).toBeInstanceOf(ApiError);
      expect(auth.isAuthenticated()).toBe(false);
      expect(storage.refreshToken()).toBeNull();
    });

    it('does not attempt a refresh for an anonymous 401', () => {
      let error: unknown;

      http.get(`${BASE_URL}/saved-jobs`).subscribe({ error: (e: unknown) => (error = e) });

      httpMock
        .expectOne(`${BASE_URL}/saved-jobs`)
        .flush(null, { status: 401, statusText: 'Unauthorized' });

      // No /auth/refresh request is expected; httpMock.verify() enforces it.
      expect((error as ApiError).status).toBe(401);
    });

    it('leaves other failures alone', () => {
      storage.set(tokens('1'));
      let error: unknown;

      http.get(`${BASE_URL}/jobs/unknown`).subscribe({ error: (e: unknown) => (error = e) });

      httpMock
        .expectOne(`${BASE_URL}/jobs/unknown`)
        .flush(
          { statusCode: 404, message: 'Job not found' },
          { status: 404, statusText: 'Not Found' },
        );

      expect((error as ApiError).status).toBe(404);
      expect((error as ApiError).message).toBe('Job not found');
    });
  });
});
