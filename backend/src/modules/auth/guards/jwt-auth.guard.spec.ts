import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { IS_OPTIONAL_AUTH_KEY } from '../../../common/decorators/optional-auth.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

function contextWithHeaders(headers: Record<string, string>): {
  context: ExecutionContext;
  request: { headers: Record<string, string>; user?: unknown };
} {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers,
  };
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('JwtAuthGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let jwtService: { verifyAsync: jest.Mock };
  let guard: JwtAuthGuard;

  /**
   * The guard reads two metadata keys, so the mock has to answer per key rather
   * than return one value for both — otherwise `@Public()` and `@OptionalAuth()`
   * would be indistinguishable in every test.
   */
  const routeIs = (decorators: {
    public?: boolean;
    optionalAuth?: boolean;
  }) => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === IS_PUBLIC_KEY
        ? (decorators.public ?? false)
        : key === IS_OPTIONAL_AUTH_KEY
          ? (decorators.optionalAuth ?? false)
          : undefined,
    );
  };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    jwtService = { verifyAsync: jest.fn() };
    guard = new JwtAuthGuard(
      reflector as unknown as Reflector,
      jwtService as unknown as JwtService,
    );
  });

  it('allows a route marked @Public() without requiring a token', async () => {
    routeIs({ public: true });
    const { context } = contextWithHeaders({});

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects a request with no Authorization header', async () => {
    routeIs({});
    const { context } = contextWithHeaders({});

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a non-Bearer scheme', async () => {
    routeIs({});
    const { context } = contextWithHeaders({ authorization: 'Basic abc123' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an invalid or expired token', async () => {
    routeIs({});
    jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const { context } = contextWithHeaders({
      authorization: 'Bearer bad.token',
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches the decoded identity to the request on success', async () => {
    routeIs({});
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      email: 'jane@example.com',
    });
    const { context, request } = contextWithHeaders({
      authorization: 'Bearer good.token',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      userId: 'user-1',
      email: 'jane@example.com',
    });
  });

  // M9.5 — `@OptionalAuth()`: authentication that is optional rather than absent.
  // `@Public()` cannot express this, because it returns before a token is ever
  // looked at, so a valid one would attach no user.
  describe('@OptionalAuth()', () => {
    it('serves a request with no token, attaching no user', async () => {
      routeIs({ optionalAuth: true });
      const { context, request } = contextWithHeaders({});

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toBeUndefined();
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('attaches the identity when a valid token is sent', async () => {
      routeIs({ optionalAuth: true });
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        email: 'jane@example.com',
      });
      const { context, request } = contextWithHeaders({
        authorization: 'Bearer good.token',
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toEqual({
        userId: 'user-1',
        email: 'jane@example.com',
      });
    });

    // Not downgraded to anonymous. A 200 with unpersonalized results would tell
    // the client nothing, and its refresh-on-401 path would never run.
    it('still rejects a token that is present but invalid', async () => {
      routeIs({ optionalAuth: true });
      jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
      const { context } = contextWithHeaders({
        authorization: 'Bearer bad.token',
      });

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    // A malformed header carries no token at all, so it is the no-token case.
    it('serves a request whose Authorization header is not a Bearer token', async () => {
      routeIs({ optionalAuth: true });
      const { context, request } = contextWithHeaders({
        authorization: 'Basic abc123',
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toBeUndefined();
    });
  });
});
