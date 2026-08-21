import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenService } from './refresh-token.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let prisma: {
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let config: { get: jest.Mock };

  beforeEach(() => {
    prisma = {
      refreshToken: {
        create: jest.fn().mockResolvedValue(undefined),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    config = { get: jest.fn().mockReturnValue('30d') };

    service = new RefreshTokenService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    );
  });

  describe('issue', () => {
    it('persists only a hash of the token, never the plaintext', async () => {
      const token = await service.issue('user-1');

      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      const [[{ data }]] = prisma.refreshToken.create.mock.calls as [
        [{ data: { userId: string; tokenHash: string; expiresAt: Date } }],
      ];
      expect(data.tokenHash).not.toEqual(token);
      expect(data.tokenHash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
      expect(data.userId).toBe('user-1');
    });

    it('issues distinct tokens on successive calls', async () => {
      const [tokenA, tokenB] = await Promise.all([
        service.issue('user-1'),
        service.issue('user-1'),
      ]);
      expect(tokenA).not.toEqual(tokenB);
    });
  });

  describe('rotate', () => {
    it('rejects an unknown token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.rotate('unknown-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an expired token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.rotate('expired-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an already-revoked token and revokes every other token for that user', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000),
      });

      await expect(service.rotate('reused-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it('revokes the presented token and returns a different, valid token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });

      const result = await service.rotate('valid-token');

      expect(result.userId).toBe('user-1');
      expect(result.token).not.toEqual('valid-token');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('revoke', () => {
    it('rejects a token that does not belong to the expected user', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'owner',
        revokedAt: null,
      });

      await expect(
        service.revoke('some-token', 'someone-else'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });

    it('rejects an unknown token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(
        service.revoke('unknown-token', 'user-1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('revokes a token owned by the expected user', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
      });

      await service.revoke('valid-token', 'user-1');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it('is idempotent for an already-revoked token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: new Date(),
      });

      await expect(
        service.revoke('valid-token', 'user-1'),
      ).resolves.toBeUndefined();
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });
  });
});
