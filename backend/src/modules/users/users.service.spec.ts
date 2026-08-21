import { UsersService } from './users.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: { create: jest.Mock; findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      user: { create: jest.fn(), findUnique: jest.fn() },
    };
    service = new UsersService(prisma as unknown as PrismaService);
  });

  it('create() persists the email and passwordHash only', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });

    await service.create({ email: 'jane@example.com', passwordHash: 'hash' });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: 'jane@example.com', passwordHash: 'hash' },
    });
  });

  it('findByEmail() looks up by the unique email index', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await service.findByEmail('jane@example.com');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'jane@example.com' },
    });
  });

  it('findById() looks up by id', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await service.findById('user-1');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
    });
  });
});
