import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { UsersService } from '../../users/users.service';

// Registered globally (AuthModule, APP_GUARD) *after* JwtAuthGuard, which is what
// puts `request.user` there. Global guards run in provider-registration order, so
// that ordering is load-bearing — see the comment in AuthModule.
//
// A route without @Roles() passes straight through: this guard only ever narrows
// access that JwtAuthGuard has already granted. Registering it globally rather
// than per-route means adding @Roles(ADMIN) is sufficient to protect a handler and
// there is no @UseGuards() to forget.
//
// The role is read from the database, not from the access token. The token carries
// only `sub` and `email` (docs/ARCHITECTURE.md §9), and because there is no
// role-management endpoint (D4) a role change is a manual database edit — most
// plausibly an emergency revocation, which must take effect now rather than when a
// 15-minute token happens to expire. This costs one indexed lookup on the handful
// of admin routes that exist.
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const currentUser = request.user;
    if (!currentUser) {
      // @Roles() on a route that never authenticated — i.e. it also carries
      // @Public(), or the guard order was changed. That is a misconfiguration, not
      // a client error, so it is logged loudly and denied rather than allowed.
      this.logger.error(
        'A @Roles() route was reached with no authenticated user; check that ' +
          'it is not also @Public() and that JwtAuthGuard still runs first.',
      );
      throw new ForbiddenException('Insufficient permissions');
    }

    const user = await this.usersService.findById(currentUser.userId);
    if (!user || !requiredRoles.includes(user.role)) {
      // Deliberately identical whether the account is gone or merely unprivileged:
      // an admin route should not confirm which user ids exist.
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
