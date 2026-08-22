import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

// Metadata key read by RolesGuard (modules/auth) to restrict a route to specific
// roles. Lives in common/ for the same reason as @Public(): it is applied by
// feature modules, not by auth itself.
export const ROLES_KEY = 'roles';

// A route with no @Roles() is not role-restricted — RolesGuard lets it through
// untouched. Authentication is still enforced separately by JwtAuthGuard.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
