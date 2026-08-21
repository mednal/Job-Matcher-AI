import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RootConfig } from '../../common/config/configuration';
import { parseDurationMs } from '../../common/utils/duration';

export interface RotatedRefreshToken {
  userId: string;
  token: string;
}

// Opaque refresh tokens (docs/ARCHITECTURE.md §9, docs/DATABASE.md §3.1): the
// plaintext is returned to the caller exactly once and never persisted — only its
// sha256 is stored, so a database disclosure yields nothing usable. Rotation
// revokes the presented token and issues a new one inside one transaction, and
// presenting an already-revoked token is treated as reuse: every other token for
// that user is revoked too, forcing re-login.
@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<RootConfig, true>,
  ) {}

  async issue(userId: string): Promise<string> {
    const token = this.generateToken();
    const expiresAt = this.computeExpiry();

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(token),
        expiresAt,
      },
    });

    return token;
  }

  async rotate(presentedToken: string): Promise<RotatedRefreshToken> {
    const tokenHash = this.hashToken(presentedToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.revokedAt) {
      // Reuse of a token that was already rotated away — treat as a potential
      // theft and contain it by revoking every other live token for this user.
      await this.revokeAllForUser(existing.userId);
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const newToken = this.generateToken();
    const newTokenHash = this.hashToken(newToken);
    const expiresAt = this.computeExpiry();

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: { userId: existing.userId, tokenHash: newTokenHash, expiresAt },
      }),
    ]);

    return { userId: existing.userId, token: newToken };
  }

  async revoke(presentedToken: string, expectedUserId: string): Promise<void> {
    const tokenHash = this.hashToken(presentedToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!existing || existing.userId !== expectedUserId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.revokedAt) {
      return; // already revoked — logout is idempotent
    }

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private generateToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private computeExpiry(): Date {
    const ttl = this.configService.get('auth.refreshTtl', { infer: true });
    return new Date(Date.now() + parseDurationMs(ttl));
  }
}
