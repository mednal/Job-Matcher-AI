import { WorkplaceType } from '@prisma/client';
import type { Profile } from '@prisma/client';
import { ProfilesService } from './profiles.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

function profileRow(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'profile-1',
    userId: 'user-1',
    displayName: 'Jane',
    yearsOfExperience: 1,
    desiredRoles: ['Java Developer'],
    technologies: ['java'],
    locations: ['Berlin'],
    countryCodes: ['DE'],
    workplaceTypes: [WorkplaceType.REMOTE],
    updatedAt: new Date('2026-08-22T10:00:00.000Z'),
    ...overrides,
  };
}

describe('ProfilesService', () => {
  let prisma: { profile: { findUnique: jest.Mock; upsert: jest.Mock } };
  let service: ProfilesService;

  beforeEach(() => {
    prisma = { profile: { findUnique: jest.fn(), upsert: jest.fn() } };
    service = new ProfilesService(prisma as unknown as PrismaService);
  });

  it('looks a profile up by userId, never by profile id', async () => {
    prisma.profile.findUnique.mockResolvedValue(profileRow());

    await service.findByUserId('user-1');

    expect(prisma.profile.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });

  it('returns null when the user has never saved a profile', async () => {
    prisma.profile.findUnique.mockResolvedValue(null);

    await expect(service.findByUserId('user-1')).resolves.toBeNull();
  });

  it('upserts, so the first PUT creates the row and later ones update it', async () => {
    prisma.profile.upsert.mockResolvedValue(profileRow());
    const dto: UpdateProfileDto = {
      displayName: 'Jane',
      yearsOfExperience: 1,
      desiredRoles: ['Java Developer'],
      technologies: ['java'],
      locations: ['Berlin'],
      countryCodes: ['DE'],
      workplaceTypes: [WorkplaceType.REMOTE],
    };

    await service.upsertForUser('user-1', dto);

    expect(prisma.profile.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1', ...dto },
      update: dto,
    });
  });

  // PUT replaces. This is what makes clearing a list expressible at all, since the
  // API surface has no PATCH for this resource.
  it('resets omitted fields to their defaults rather than leaving them alone', async () => {
    prisma.profile.upsert.mockResolvedValue(profileRow());

    await service.upsertForUser('user-1', {});

    const expected = {
      displayName: null,
      yearsOfExperience: 0,
      desiredRoles: [],
      technologies: [],
      locations: [],
      countryCodes: [],
      workplaceTypes: [],
    };
    expect(prisma.profile.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1', ...expected },
      update: expected,
    });
  });

  it('never accepts a caller-supplied profile id or userId in the payload', async () => {
    prisma.profile.upsert.mockResolvedValue(profileRow());

    await service.upsertForUser('user-1', {
      displayName: 'Jane',
    });

    const call = prisma.profile.upsert.mock.calls[0] as [
      { create: Record<string, unknown>; update: Record<string, unknown> },
    ];
    expect(call[0].create.userId).toBe('user-1');
    expect(call[0].update).not.toHaveProperty('userId');
    expect(call[0].update).not.toHaveProperty('id');
  });
});
