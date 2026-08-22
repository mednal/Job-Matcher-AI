import { Body, Controller, Get, Put } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { ProfileResponse } from './dto/profile.response';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

// Both routes are authenticated (the global JwtAuthGuard; no @Public() here) and
// address only `me`. There is deliberately no /profiles/:id — a user cannot name
// another user's profile because the API surface offers no way to say it
// (docs/ARCHITECTURE.md §8).
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('me')
  async findMine(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<ProfileResponse> {
    const profile = await this.profilesService.findByUserId(currentUser.userId);
    // No row yet — the account exists but has never saved a profile.
    return profile
      ? ProfileResponse.fromEntity(profile)
      : ProfileResponse.empty();
  }

  @Put('me')
  async updateMine(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponse> {
    const profile = await this.profilesService.upsertForUser(
      currentUser.userId,
      dto,
    );
    return ProfileResponse.fromEntity(profile);
  }
}
