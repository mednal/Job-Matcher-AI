import { Profile } from '../../core/models/profile';
import { MAX_FILTER_VALUES } from '../../core/models/search';
import { hasDefaults, searchDefaultsFrom } from './profile-defaults';

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    displayName: null,
    yearsOfExperience: 0,
    desiredRoles: [],
    technologies: [],
    locations: [],
    countryCodes: [],
    workplaceTypes: [],
    updatedAt: '2026-08-24T09:00:00.000Z',
    ...overrides,
  };
}

describe('searchDefaultsFrom', () => {
  it('carries the profile fields that have a filter of the same meaning', () => {
    expect(
      searchDefaultsFrom(
        profile({
          technologies: ['java', 'spring'],
          locations: ['Berlin, Germany'],
          countryCodes: ['DE'],
          workplaceTypes: ['REMOTE', 'HYBRID'],
        }),
      ),
    ).toEqual({
      technologies: ['java', 'spring'],
      locations: ['Berlin, Germany'],
      countryCode: ['DE'],
      workplaceType: ['REMOTE', 'HYBRID'],
    });
  });

  it('leaves the roles out — a list of preferences is not a full-text query', () => {
    expect(searchDefaultsFrom(profile({ desiredRoles: ['Junior Java Developer'] }))).toEqual({});
  });

  /**
   * M11.12 — this used to be "leaves the country out when the profile names
   * several, rather than picking one", because the search took a single code.
   * Widening the parameter is what lets the whole list through, so the more
   * carefully someone fills the profile in, the more of it reaches their search.
   */
  it('carries every country the profile names', () => {
    expect(searchDefaultsFrom(profile({ countryCodes: ['DE', 'AT'] })).countryCode).toEqual([
      'DE',
      'AT',
    ]);
  });

  it('trims a list to the cap the search endpoint enforces', () => {
    const many = Array.from({ length: MAX_FILTER_VALUES + 5 }, (_, index) => `tech-${index}`);

    expect(searchDefaultsFrom(profile({ technologies: many })).technologies).toHaveLength(
      MAX_FILTER_VALUES,
    );
  });

  it('says nothing for an empty profile', () => {
    expect(hasDefaults(searchDefaultsFrom(profile()))).toBe(false);
  });

  it('says something as soon as one usable field is filled in', () => {
    expect(hasDefaults(searchDefaultsFrom(profile({ technologies: ['java'] })))).toBe(true);
  });
});
