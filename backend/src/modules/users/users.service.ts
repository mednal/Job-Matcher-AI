import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
}

// The only place `prisma.user` is touched (docs/ARCHITECTURE.md §4.2). Returns
// the full Prisma `User` — including passwordHash — because AuthService needs it
// for credential verification; that is still service-to-service, not a controller
// boundary. Controllers (UsersController) map this to a response DTO themselves.
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateUserInput): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
      },
    });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
