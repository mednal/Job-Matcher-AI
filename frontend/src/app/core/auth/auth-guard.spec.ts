import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { authGuard } from './auth-guard';
import { TokenStorage } from './token-storage';

function activate(url: string): boolean | UrlTree {
  const state = { url } as RouterStateSnapshot;
  const route = {} as ActivatedRouteSnapshot;

  return TestBed.runInInjectionContext(() => authGuard(route, state)) as boolean | UrlTree;
}

describe('authGuard', () => {
  let storage: TokenStorage;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    storage = TestBed.inject(TokenStorage);
  });

  afterEach(() => localStorage.clear());

  it('lets a signed-in user through', () => {
    storage.set({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 });

    expect(activate('/saved')).toBe(true);
  });

  it('sends an anonymous visitor to the login form', () => {
    const result = activate('/saved');

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toContain('/auth/login');
  });

  // Without this the user lands on the search page after signing in and has to
  // find their way back to what they were opening.
  it('carries where the user was going, so login can return them to it', () => {
    const result = activate('/jobs/abc-123');

    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
      '/auth/login?redirectTo=%2Fjobs%2Fabc-123',
    );
  });
});
