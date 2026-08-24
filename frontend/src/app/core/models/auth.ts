import { UserRole } from './enums';
import { IsoDateString } from './job';

export interface Credentials {
  email: string;
  password: string;
}

/** `POST /auth/register` and `POST /auth/login` both answer with this. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds, so a client knows when to refresh. */
  expiresIn: number;
}

/** `GET /users/me`. Never carries a password hash — the backend projects it away. */
export interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: IsoDateString;
}

/** Mirrors `backend/src/modules/auth/dto/register.dto.ts`. */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_EMAIL_LENGTH = 254;
