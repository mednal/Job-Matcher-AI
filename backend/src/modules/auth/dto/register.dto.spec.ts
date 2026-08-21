import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

describe('RegisterDto', () => {
  it('trims and lowercases the email', () => {
    const dto = plainToInstance(RegisterDto, {
      email: '  Jane@Example.COM  ',
      password: 'a-valid-password',
    });

    expect(dto.email).toBe('jane@example.com');
  });

  it('rejects a password shorter than 10 characters', async () => {
    const dto = plainToInstance(RegisterDto, {
      email: 'jane@example.com',
      password: 'short',
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('rejects a malformed email', async () => {
    const dto = plainToInstance(RegisterDto, {
      email: 'not-an-email',
      password: 'a-valid-password',
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });
});
