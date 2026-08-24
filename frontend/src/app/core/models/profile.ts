import { WorkplaceType } from './enums';
import { IsoDateString } from './job';

/**
 * `GET /profiles/me`. Every authenticated user conceptually has one, so a brand
 * new account gets an empty profile rather than a 404 — `updatedAt: null` is
 * what distinguishes "never saved" from "saved empty".
 */
export interface Profile {
  displayName: string | null;
  yearsOfExperience: number;
  desiredRoles: string[];
  technologies: string[];
  locations: string[];
  countryCodes: string[];
  workplaceTypes: WorkplaceType[];
  updatedAt: IsoDateString | null;
}

/**
 * `PUT /profiles/me` — a full replacement, not a merge. An omitted list is
 * cleared, which is the only way a client can empty one, so a form must send
 * every field it manages rather than only the ones it changed.
 */
export interface ProfileUpdate {
  displayName?: string;
  yearsOfExperience?: number;
  desiredRoles?: string[];
  technologies?: string[];
  locations?: string[];
  countryCodes?: string[];
  workplaceTypes?: WorkplaceType[];
}

/** Mirrors the caps in `backend/src/modules/profiles/dto/update-profile.dto.ts`. */
export const MAX_PROFILE_LIST_LENGTH = 50;
export const MAX_PROFILE_ENTRY_LENGTH = 100;
export const MAX_YEARS_OF_EXPERIENCE = 60;
