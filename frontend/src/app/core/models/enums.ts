/**
 * The API's closed vocabularies, mirroring the Prisma enums the backend returns
 * (`backend/prisma/schema.prisma`).
 *
 * Union types rather than TypeScript `enum`s: the wire values are plain strings,
 * a union compares against them directly, and no runtime object is emitted for
 * what is only a contract. The `const` arrays exist because filter panels have to
 * *list* the members, and a hand-written second list would drift.
 */

export const WORKPLACE_TYPES = ['REMOTE', 'ONSITE', 'HYBRID'] as const;
export type WorkplaceType = (typeof WORKPLACE_TYPES)[number];

export const EMPLOYMENT_TYPES = [
  'FULL_TIME',
  'PART_TIME',
  'INTERNSHIP',
  'CONTRACT',
  'WORKING_STUDENT',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/**
 * Ordered from most to least suitable for a junior, exactly as the schema
 * declares it. `CLAUDE.md` fixes these five members: they must not be extended or
 * renamed here without the same decision being taken on the backend.
 */
export const JUNIOR_LEVELS = [
  'ENTRY_LEVEL',
  'LIKELY_ENTRY_LEVEL',
  'AMBIGUOUS',
  'EXPERIENCED',
  'CLEARLY_EXPERIENCED',
] as const;
export type JuniorLevel = (typeof JUNIOR_LEVELS)[number];

export type UserRole = 'USER' | 'ADMIN';
