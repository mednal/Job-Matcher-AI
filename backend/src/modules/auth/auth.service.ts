import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, type User } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { PasswordHasherService } from './password-hasher.service';
import { RefreshTokenService } from './refresh-token.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthTokensResponse } from './dto/auth-tokens.response';
import { RootConfig } from '../../common/config/configuration';
import { parseDurationMs } from '../../common/utils/duration';

// Same message and exception type for "unknown email" and "wrong password"
// (docs/MILESTONES.md M3.2) so the response cannot be used to enumerate accounts.
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

// Precomputed argon2id hash of a fixed dummy value. On an unknown-email login we
// still run a verify against this so the two failure paths cost the same time —
// without it, "unknown email" would return faster than "wrong password" and leak
// which emails are registered.
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$Ki6Y+2EhfQm35mqGA3aOoQ$h48u3EjiVayTeTsYXKbaJ0+p/rc53jRmAWL86R4TCv4';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordHasher: PasswordHasherService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<RootConfig, true>,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokensResponse> {
    const passwordHash = await this.passwordHasher.hash(dto.password);

    let user: User;
    try {
      user = await this.usersService.create({
        email: dto.email,
        passwordHash,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }

    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthTokensResponse> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      // Burn the same amount of time an unsuccessful verify would take.
      await this.passwordHasher.verify(DUMMY_PASSWORD_HASH, dto.password);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordValid = await this.passwordHasher.verify(
      user.passwordHash,
      dto.password,
    );
    if (!passwordValid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokensResponse> {
    const rotated = await this.refreshTokenService.rotate(refreshToken);

    const user = await this.usersService.findById(rotated.userId);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const accessToken = await this.signAccessToken(user);
    return this.buildTokensResponse(accessToken, rotated.token);
  }

  async logout(refreshToken: string, currentUserId: string): Promise<void> {
    await this.refreshTokenService.revoke(refreshToken, currentUserId);
  }

  private async issueTokens(user: User): Promise<AuthTokensResponse> {
    const accessToken = await this.signAccessToken(user);
    const refreshToken = await this.refreshTokenService.issue(user.id);
    return this.buildTokensResponse(accessToken, refreshToken);
  }

  private signAccessToken(user: User): Promise<string> {
    return this.jwtService.signAsync({ sub: user.id, email: user.email });
  }

  private buildTokensResponse(
    accessToken: string,
    refreshToken: string,
  ): AuthTokensResponse {
    const accessTtl = this.configService.get('auth.accessTtl', {
      infer: true,
    });
    const response = new AuthTokensResponse();
    response.accessToken = accessToken;
    response.refreshToken = refreshToken;
    response.expiresIn = Math.floor(parseDurationMs(accessTtl) / 1000);
    return response;
  }
}
