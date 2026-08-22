import type { Profile, WorkplaceType } from '@prisma/client';

// Hand-written projection, like UserResponse — `userId` and the surrogate `id`
// stay inside the service. The caller is always the owner (the only route is
// /profiles/me), so echoing an id back tells them nothing they did not supply and
// is one more identifier on the wire.
export class ProfileResponse {
  displayName!: string | null;
  yearsOfExperience!: number;
  desiredRoles!: string[];
  technologies!: string[];
  locations!: string[];
  countryCodes!: string[];
  workplaceTypes!: WorkplaceType[];
  // Null until the profile has been saved for the first time — see `empty()`.
  updatedAt!: Date | null;

  static fromEntity(profile: Profile): ProfileResponse {
    const response = new ProfileResponse();
    response.displayName = profile.displayName;
    response.yearsOfExperience = profile.yearsOfExperience;
    response.desiredRoles = profile.desiredRoles;
    response.technologies = profile.technologies;
    response.locations = profile.locations;
    response.countryCodes = profile.countryCodes;
    response.workplaceTypes = profile.workplaceTypes;
    response.updatedAt = profile.updatedAt;
    return response;
  }

  // Registration does not create a Profile row, so a user who has never saved one
  // has nothing to read. GET returns this empty profile rather than 404: every
  // authenticated user conceptually *has* a search profile, and a 404 would force
  // every client to special-case a brand-new account before it can render a form.
  // `updatedAt: null` is what distinguishes "never saved" from "saved empty".
  static empty(): ProfileResponse {
    const response = new ProfileResponse();
    response.displayName = null;
    response.yearsOfExperience = 0;
    response.desiredRoles = [];
    response.technologies = [];
    response.locations = [];
    response.countryCodes = [];
    response.workplaceTypes = [];
    response.updatedAt = null;
    return response;
  }
}
