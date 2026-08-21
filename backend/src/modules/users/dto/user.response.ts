import type { User, UserRole } from '@prisma/client';

// Hand-written projection — never a Prisma model with fields deleted — so
// passwordHash structurally cannot leak into a response.
export class UserResponse {
  id!: string;
  email!: string;
  role!: UserRole;
  createdAt!: Date;

  static fromEntity(user: User): UserResponse {
    const response = new UserResponse();
    response.id = user.id;
    response.email = user.email;
    response.role = user.role;
    response.createdAt = user.createdAt;
    return response;
  }
}
