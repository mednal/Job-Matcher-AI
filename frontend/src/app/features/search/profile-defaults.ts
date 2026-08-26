import { Profile } from '../../core/models/profile';
import { MAX_FILTER_VALUES, SearchQuery } from '../../core/models/search';

/**
 * M11.9 — the filters a signed-in user's *first* search starts with, derived from
 * their saved profile.
 *
 * Only the profile fields that have a search parameter of the same meaning are
 * used. `desiredRoles` is deliberately not turned into `q`: the roles are a list
 * of preferences, and joining them into one full-text query would search for a
 * phrase nobody wrote.
 *
 * `countryCodes` used to be carried over only when the profile named exactly
 * one, because the search took a single code and picking the first of several
 * would have narrowed the search to a country the user never singled out — so
 * the more carefully someone filled the profile in, the less of it reached
 * their search. M11.12 widened the parameter to a list and the whole list is
 * carried.
 *
 * Every list is trimmed to `MAX_FILTER_VALUES`, the cap the search endpoint
 * enforces — the profile's own cap is larger, and sending the whole of a long
 * list would answer with a 400 instead of a search.
 */
export function searchDefaultsFrom(profile: Profile): SearchQuery {
  const defaults: SearchQuery = {};

  if (profile.technologies.length > 0) {
    defaults.technologies = profile.technologies.slice(0, MAX_FILTER_VALUES);
  }
  if (profile.locations.length > 0) {
    defaults.locations = profile.locations.slice(0, MAX_FILTER_VALUES);
  }
  if (profile.countryCodes.length > 0) {
    defaults.countryCode = profile.countryCodes.slice(0, MAX_FILTER_VALUES);
  }
  if (profile.workplaceTypes.length > 0) {
    defaults.workplaceType = [...profile.workplaceTypes];
  }

  return defaults;
}

/** Whether the derived defaults would say anything at all. */
export function hasDefaults(defaults: SearchQuery): boolean {
  return Object.keys(defaults).length > 0;
}
