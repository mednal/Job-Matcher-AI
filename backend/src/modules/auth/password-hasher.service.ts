import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';

// argon2id hashing behind a narrow interface, per docs/DATABASE.md §3.1 and
// docs/ARCHITECTURE.md §9. Isolated in one file so the algorithm — or the
// documented bcrypt fallback, should argon2's native build ever fight Windows —
// is a one-file change.
@Injectable()
export class PasswordHasherService {
  private readonly logger = new Logger(PasswordHasherService.name);

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch (error) {
      // A malformed/foreign hash string throws rather than returning false —
      // normalize that to a plain non-match instead of leaking a 500.
      this.logger.warn(
        'Password verification failed on a malformed hash',
        error,
      );
      return false;
    }
  }
}
