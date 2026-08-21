import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Minimal identity JwtAuthGuard (modules/auth) attaches to the request after
// verifying an access token. Deliberately not a full User record — a stateless
// token carries only what it was signed with (docs/ARCHITECTURE.md §9: sub, email).
export interface AuthenticatedUser {
  userId: string;
  email: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
