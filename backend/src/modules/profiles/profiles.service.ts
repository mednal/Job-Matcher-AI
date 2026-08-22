import { Injectable } from '@nestjs/common';
import type { Profile } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

// The only place `prisma.profile` is touched (docs/ARCHITECTURE.md §4.2).
//
// Every method is keyed by `userId`, which callers take from the verified access
// token — no method accepts a profile id, so there is no parameter through which
// one user could address another's profile. That is the ownership rule enforced
// structurally rather than by a check that can be forgotten.
@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<Profile | null> {
    return this.prisma.profile.findUnique({ where: { userId } });
  }

  // Upsert, because registration does not create a Profile row: the first PUT is
  // a create and every later one an update, and the client should not have to know
  // which. Replacement semantics — an omitted field is reset to its default, not
  // left alone (see UpdateProfileDto).
  upsertForUser(userId: string, dto: UpdateProfileDto): Promise<Profile> {
    const values = {
      displayName: dto.displayName ?? null,
      yearsOfExperience: dto.yearsOfExperience ?? 0,
      desiredRoles: dto.desiredRoles ?? [],
      technologies: dto.technologies ?? [],
      locations: dto.locations ?? [],
      countryCodes: dto.countryCodes ?? [],
      workplaceTypes: dto.workplaceTypes ?? [],
    };

    return this.prisma.profile.upsert({
      where: { userId },
      create: { userId, ...values },
      update: values,
    });
  }
}
