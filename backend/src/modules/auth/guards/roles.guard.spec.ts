import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import type { User } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { UsersService } from '../../users/users.service';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

function contextWithUser(user?: AuthenticatedUser): ExecutionContext {
  const request: { user?: AuthenticatedUser } = { user };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function userWithRole(role: UserRole): User {
  return {
    id: 'user-1',
    email: 'jane@example.com',
    passwordHash: 'irrelevant',
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const authenticated: AuthenticatedUser = {
  userId: 'user-1',
  email: 'jane@example.com',
};

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let usersService: { findById: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    usersService = { findById: jest.fn() };
    guard = new RolesGuard(
      reflector as unknown as Reflector,
      usersService as unknown as UsersService,
    );
  });

  it('lets a route without @Roles() through without a database lookup', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(
      guard.canActivate(contextWithUser(authenticated)),
    ).resolves.toBe(true);
    expect(usersService.findById).not.toHaveBeenCalled();
  });

  it('treats an empty @Roles() list as no restriction', async () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    await expect(
      guard.canActivate(contextWithUser(authenticated)),
    ).resolves.toBe(true);
    expect(usersService.findById).not.toHaveBeenCalled();
  });

  it('allows a user whose role matches', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    usersService.findById.mockResolvedValue(userWithRole(UserRole.ADMIN));

    await expect(
      guard.canActivate(contextWithUser(authenticated)),
    ).resolves.toBe(true);
  });

  it('denies a USER on an ADMIN route', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    usersService.findById.mockResolvedValue(userWithRole(UserRole.USER));

    await expect(
      guard.canActivate(contextWithUser(authenticated)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // The role must come from the database, not the token: the access token carries
  // no role at all, and a demotion has to take effect before the token expires.
  it('reads the current role from the database, not from the token', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    usersService.findById.mockResolvedValue(userWithRole(UserRole.USER));

    await expect(
      guard.canActivate(contextWithUser(authenticated)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(usersService.findById).toHaveBeenCalledWith('user-1');
  });

  it('denies when the account behind a valid token no longer exists', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    usersService.findById.mockResolvedValue(null);

    await expect(
      guard.canActivate(contextWithUser(authenticated)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // @Roles() combined with @Public() would otherwise reach the handler with no
  // identity to check. Deny, do not fall open.
  it('denies a @Roles() route reached with no authenticated user', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    await expect(
      guard.canActivate(contextWithUser(undefined)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(usersService.findById).not.toHaveBeenCalled();
  });

  it('accepts any role in the required list', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      UserRole.USER,
      UserRole.ADMIN,
    ]);
    usersService.findById.mockResolvedValue(userWithRole(UserRole.USER));

    await expect(
      guard.canActivate(contextWithUser(authenticated)),
    ).resolves.toBe(true);
  });
});
