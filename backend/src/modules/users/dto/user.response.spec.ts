import type { User } from '@prisma/client';
import { UserResponse } from './user.response';

describe('UserResponse.fromEntity', () => {
  it('never carries passwordHash', () => {
    const user: User = {
      id: 'user-1',
      email: 'jane@example.com',
      passwordHash: 'super-secret-hash',
      role: 'USER',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const response = UserResponse.fromEntity(user);

    expect(response).toEqual({
      id: 'user-1',
      email: 'jane@example.com',
      role: 'USER',
      createdAt: user.createdAt,
    });
    expect(Object.keys(response)).not.toContain('passwordHash');
  });
});
