import { ExecutionContext } from '@nestjs/common';
import { isAuthRequest } from './throttling.module';

const contextFor = (path: string): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ path }) }),
  }) as ExecutionContext;

describe('isAuthRequest', () => {
  // The stricter limit follows the path, so this is the whole definition of
  // "an auth route" — a new one under /auth/ is covered without being told to be.
  it.each([
    '/api/v1/auth/login',
    '/api/v1/auth/register',
    '/api/v1/auth/refresh',
    '/api/v1/auth/logout',
  ])('%s takes the stricter limit', (path) => {
    expect(isAuthRequest(contextFor(path))).toBe(true);
  });

  it.each([
    '/api/v1/jobs',
    '/api/v1/jobs/search',
    '/api/v1/saved-jobs',
    '/api/v1/health',
    // Not a prefix match on a different segment: only the real auth path counts.
    '/api/v1/authors',
    '/api/v2/auth/login',
  ])('%s takes only the global limit', (path) => {
    expect(isAuthRequest(contextFor(path))).toBe(false);
  });

  it('does not throw on a request without a path', () => {
    expect(isAuthRequest(contextFor(undefined as unknown as string))).toBe(
      false,
    );
  });
});
