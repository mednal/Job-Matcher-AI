import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PasswordHasherService } from './password-hasher.service';
import { RefreshTokenService } from './refresh-token.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

function uniqueEmailViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
  });
}

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    create: jest.Mock;
    findByEmail: jest.Mock;
    findById: jest.Mock;
  };
  let passwordHasher: { hash: jest.Mock; verify: jest.Mock };
  let refreshTokenService: {
    issue: jest.Mock;
    rotate: jest.Mock;
    revoke: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock };
  let configService: { get: jest.Mock };

  const user = {
    id: 'user-1',
    email: 'jane@example.com',
    passwordHash: 'stored-hash',
    role: 'USER',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    usersService = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
    };
    passwordHasher = {
      hash: jest.fn().mockResolvedValue('hashed-password'),
      verify: jest.fn(),
    };
    refreshTokenService = {
      issue: jest.fn().mockResolvedValue('refresh-token-plaintext'),
      rotate: jest.fn(),
      revoke: jest.fn().mockResolvedValue(undefined),
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('access-token') };
    configService = { get: jest.fn().mockReturnValue('15m') };

    service = new AuthService(
      usersService as unknown as UsersService,
      passwordHasher as unknown as PasswordHasherService,
      refreshTokenService as unknown as RefreshTokenService,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  describe('register', () => {
    it('hashes the password and issues a token pair on success', async () => {
      usersService.create.mockResolvedValue(user);

      const result = await service.register({
        email: 'jane@example.com',
        password: 'plaintext-password',
      });

      expect(passwordHasher.hash).toHaveBeenCalledWith('plaintext-password');
      expect(usersService.create).toHaveBeenCalledWith({
        email: 'jane@example.com',
        passwordHash: 'hashed-password',
      });
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token-plaintext',
        expiresIn: 900,
      });
    });

    it('maps a duplicate-email constraint violation to a 409', async () => {
      usersService.create.mockRejectedValue(uniqueEmailViolation());

      await expect(
        service.register({
          email: 'jane@example.com',
          password: 'x'.repeat(12),
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows unrelated errors unchanged', async () => {
      const dbError = new Error('connection lost');
      usersService.create.mockRejectedValue(dbError);

      await expect(
        service.register({
          email: 'jane@example.com',
          password: 'x'.repeat(12),
        }),
      ).rejects.toBe(dbError);
    });

    it('signs the access token with exactly sub and email', async () => {
      usersService.create.mockResolvedValue(user);

      await service.register({
        email: 'jane@example.com',
        password: 'plaintext-password',
      });

      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
      });
    });
  });

  describe('login', () => {
    it('rejects an unknown email, still running a hash verification', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      passwordHasher.verify.mockResolvedValue(false);

      await expect(
        service.login({ email: 'ghost@example.com', password: 'whatever' }),
      ).rejects.toMatchObject({
        status: 401,
        message: 'Invalid email or password',
      });
      // Timing-equalization: verify still runs even though there's no user.
      expect(passwordHasher.verify).toHaveBeenCalledTimes(1);
    });

    it('rejects a wrong password with the identical error as an unknown email', async () => {
      usersService.findByEmail.mockResolvedValue(user);
      passwordHasher.verify.mockResolvedValue(false);

      await expect(
        service.login({ email: user.email, password: 'wrong' }),
      ).rejects.toMatchObject({
        status: 401,
        message: 'Invalid email or password',
      });
    });

    it('issues tokens on correct credentials', async () => {
      usersService.findByEmail.mockResolvedValue(user);
      passwordHasher.verify.mockResolvedValue(true);

      const result = await service.login({
        email: user.email,
        password: 'correct',
      });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token-plaintext');
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token and mints a new access token', async () => {
      refreshTokenService.rotate.mockResolvedValue({
        userId: user.id,
        token: 'new-refresh-token',
      });
      usersService.findById.mockResolvedValue(user);

      const result = await service.refresh('old-refresh-token');

      expect(refreshTokenService.rotate).toHaveBeenCalledWith(
        'old-refresh-token',
      );
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(result.accessToken).toBe('access-token');
    });

    it('rejects if the token rotates to a user that no longer exists', async () => {
      refreshTokenService.rotate.mockResolvedValue({
        userId: 'ghost-user',
        token: 'new-refresh-token',
      });
      usersService.findById.mockResolvedValue(null);

      await expect(service.refresh('old-refresh-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('delegates revocation scoped to the current user', async () => {
      await service.logout('some-refresh-token', 'user-1');

      expect(refreshTokenService.revoke).toHaveBeenCalledWith(
        'some-refresh-token',
        'user-1',
      );
    });

    it('propagates rejection when the token does not belong to the user', async () => {
      refreshTokenService.revoke.mockRejectedValue(
        new UnauthorizedException('Invalid refresh token'),
      );

      await expect(
        service.logout('someone-elses-token', 'user-1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
