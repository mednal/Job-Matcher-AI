import { Controller, Get, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserResponse } from './dto/user.response';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async me(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<UserResponse> {
    const user = await this.usersService.findById(currentUser.userId);
    if (!user) {
      // The token was valid but the account behind it is gone (e.g. deleted
      // between requests) — not a client error.
      throw new NotFoundException('User not found');
    }
    return UserResponse.fromEntity(user);
  }
}
