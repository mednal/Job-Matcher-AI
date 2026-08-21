import { PasswordHasherService } from './password-hasher.service';

describe('PasswordHasherService', () => {
  let service: PasswordHasherService;

  beforeEach(() => {
    service = new PasswordHasherService();
  });

  it('produces a hash that is never equal to the plaintext', async () => {
    const hash = await service.hash('correct horse battery staple');
    expect(hash).not.toEqual('correct horse battery staple');
  });

  it('verifies a correct password as true', async () => {
    const hash = await service.hash('correct horse battery staple');
    await expect(
      service.verify(hash, 'correct horse battery staple'),
    ).resolves.toBe(true);
  });

  it('verifies an incorrect password as false', async () => {
    const hash = await service.hash('correct horse battery staple');
    await expect(service.verify(hash, 'wrong password')).resolves.toBe(false);
  });

  it('produces distinct hashes for the same input (distinct salts)', async () => {
    const [hashA, hashB] = await Promise.all([
      service.hash('same-password'),
      service.hash('same-password'),
    ]);
    expect(hashA).not.toEqual(hashB);
  });

  it('returns false rather than throwing on a malformed hash', async () => {
    await expect(service.verify('not-a-real-hash', 'anything')).resolves.toBe(
      false,
    );
  });
});
