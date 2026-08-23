import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Minimal identity JwtAuthGuard (modules/auth) attaches to the request after
// verifying an access token. Deliberately not a full User record — a stateless
// token carries only what it was signed with (docs/ARCHITECTURE.md §9: sub, email).
export interface AuthenticatedUser {
  userId: string;
  email: string;
}

// `undefined` on an @OptionalAuth() route with no token (M9.5) — there, the
// absence of a user is a valid request, not a guard that failed to run. On a
// route the guard authenticates, `user` is always set, which is why those
// controllers may still annotate the parameter as `AuthenticatedUser`.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    return request.user;
  },
);
