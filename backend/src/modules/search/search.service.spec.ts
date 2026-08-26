import type { Profile } from '@prisma/client';
import { SearchService } from './search.service';
import {
  NO_FILTERS,
  SearchCriteria,
  SearchPage,
  SearchRepository,
  SearchResultRow,
} from './search.repository';
import { ProfilesService } from '../profiles/profiles.service';
import { SearchQuery, SearchSort } from './dto/search.query';

function resultRow(overrides: Partial<SearchResultRow> = {}): SearchResultRow {
  return {
    id: 'job-1',
    title: 'Junior Backend Developer',
    companyName: 'Aurelia Systems Ltd',
    location: 'Dublin',
    countryCode: 'IE',
    workplaceType: 'HYBRID',
    employmentType: 'FULL_TIME',
    language: 'en',
    technologies: ['java'],
    postedAt: new Date('2026-08-19T00:00:00.000Z'),
    effectivePostedAt: new Date('2026-08-19T00:00:00.000Z'),
    juniorLevel: 'ENTRY_LEVEL',
    juniorScore: 94,
    requiredMinYears: 0,
    requiredMaxYears: 1,
    positiveSignals: [],
    negativeSignals: [],
    sourceCount: 2,
    rank: 0.42,
    ...overrides,
  };
}

function query(overrides: Partial<SearchQuery> = {}): SearchQuery {
  return Object.assign(new SearchQuery(), overrides);
}

const USER_ID = 'user-1';

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'profile-1',
    userId: USER_ID,
    displayName: null,
    yearsOfExperience: 0,
    desiredRoles: [],
    technologies: [],
    locations: [],
    countryCodes: [],
    workplaceTypes: [],
    updatedAt: new Date('2026-08-20T00:00:00.000Z'),
    ...overrides,
  };
}

describe('SearchService', () => {
  let calls: SearchCriteria[];
  let page: SearchPage;
  let service: SearchService;
  /** What `ProfilesService` answers with; `null` is "never saved a profile". */
  let storedProfile: Profile | null;
  /** Every userId the service actually looked a profile up for. */
  let profileLookups: string[];

  beforeEach(() => {
    calls = [];
    page = { rows: [], total: 0 };
    storedProfile = null;
    profileLookups = [];
    const repository = {
      findPage: (criteria: SearchCriteria) => {
        calls.push(criteria);
        return Promise.resolve(page);
      },
    } as unknown as SearchRepository;
    const profiles = {
      findByUserId: (userId: string) => {
        profileLookups.push(userId);
        return Promise.resolve(storedProfile);
      },
    } as unknown as ProfilesService;
    service = new SearchService(repository, profiles);
  });

  it('passes the text query through and translates the page into skip/take', async () => {
    await service.search(query({ q: 'junior java', page: 3, pageSize: 20 }));

    expect(calls).toEqual([
      {
        q: 'junior java',
        filters: NO_FILTERS,
        sort: SearchSort.RELEVANCE,
        profile: null,
        skip: 40,
        take: 20,
      },
    ]);
  });

  // `null` and not `''`: the repository treats them differently on purpose, since
  // an empty tsquery matches nothing while no query at all matches everything.
  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['whitespace', '   '],
  ])('sends null when the query is %s', async (_name, q) => {
    await service.search(query({ q }));

    expect(calls[0].q).toBeNull();
  });

  it('trims a query the DTO did not go through', async () => {
    await service.search(query({ q: '  spring boot  ' }));

    expect(calls[0].q).toBe('spring boot');
  });

  it('maps rows to summaries and returns the standard envelope', async () => {
    page = {
      rows: [resultRow(), resultRow({ id: 'job-2', sourceCount: 1 })],
      total: 137,
    };

    const response = await service.search(query({ page: 2, pageSize: 20 }));

    expect(response).toEqual({
      items: [
        expect.objectContaining({ id: 'job-1', sourceCount: 2 }),
        expect.objectContaining({ id: 'job-2', sourceCount: 1 }),
      ],
      page: 2,
      pageSize: 20,
      total: 137,
    });
  });

  describe('filters', () => {
    it('passes every filter of ARCHITECTURE.md 8.1 through unchanged', async () => {
      await service.search(
        query({
          technologies: ['java', 'spring-boot'],
          locations: ['Berlin'],
          countryCode: ['DE'],
          workplaceType: ['REMOTE'],
          employmentType: ['FULL_TIME', 'INTERNSHIP'],
          juniorLevel: ['ENTRY_LEVEL'],
          minJuniorScore: 70,
          maxYearsRequired: 2,
          postedWithinDays: 30,
        }),
      );

      expect(calls[0].filters).toEqual({
        technologies: ['java', 'spring-boot'],
        locations: ['Berlin'],
        countryCode: ['DE'],
        workplaceType: ['REMOTE'],
        employmentType: ['FULL_TIME', 'INTERNSHIP'],
        juniorLevel: ['ENTRY_LEVEL'],
        minJuniorScore: 70,
        maxYearsRequired: 2,
        postedWithinDays: 30,
      });
    });

    // The repository reads an empty array as "not requested". Anything else would
    // turn `?technologies=` into a filter no job can satisfy.
    it('sends an unrequested filter as empty, not undefined', async () => {
      await service.search(query({ q: 'java' }));

      expect(calls[0].filters).toEqual(NO_FILTERS);
    });

    // `0` is a real bound on both — "requires no experience" and "score at least
    // 0" — so it must not be collapsed into "no filter" by a falsy check.
    it('keeps a zero bound rather than reading it as absent', async () => {
      await service.search(query({ maxYearsRequired: 0, minJuniorScore: 0 }));

      expect(calls[0].filters.maxYearsRequired).toBe(0);
      expect(calls[0].filters.minJuniorScore).toBe(0);
    });
  });

  describe('sort', () => {
    it('passes the requested ordering through', async () => {
      await service.search(query({ sort: SearchSort.POSTED_AT }));

      expect(calls[0].sort).toBe(SearchSort.POSTED_AT);
    });

    // The DTO defaults it, but the service is called directly too, so the default
    // cannot live only on the wire contract.
    it('falls back to relevance when the caller names no ordering', async () => {
      await service.search(query({ sort: undefined }));

      expect(calls[0].sort).toBe(SearchSort.RELEVANCE);
    });
  });

  // M9.5 — profile fit. The service's job is deciding *whether* there is a
  // profile to rank by; what the fit is worth is the repository's.
  describe('profile fit', () => {
    it('sends no profile for an anonymous request', async () => {
      await service.search(query({ q: 'java' }));

      expect(calls[0].profile).toBeNull();
      expect(profileLookups).toEqual([]);
    });

    it('reduces the stored profile to the technologies and places it ranks by', async () => {
      storedProfile = profile({
        technologies: ['java', 'spring-boot'],
        locations: ['Berlin'],
        countryCodes: ['DE'],
        // Read by neither: the milestone weights technologies and locations.
        desiredRoles: ['Java Developer'],
        yearsOfExperience: 1,
      });

      await service.search(query({ q: 'java' }), USER_ID);

      expect(profileLookups).toEqual([USER_ID]);
      expect(calls[0].profile).toEqual({
        technologies: ['java', 'spring-boot'],
        locations: ['Berlin'],
        countryCodes: ['DE'],
        yearsOfExperience: 1,
      });
    });

    // A registered user who has never saved a profile must rank exactly like an
    // anonymous one, so the repository sees the same `null` in both cases rather
    // than an empty fit it would have to special-case.
    it('sends no profile when the user has never saved one', async () => {
      storedProfile = null;

      await service.search(query({ q: 'java' }), USER_ID);

      expect(calls[0].profile).toBeNull();
    });

    it('sends no profile when the saved one names nothing to rank by', async () => {
      // A display name is not a preference, and zero years is the default the
      // profile arrives with rather than something its owner stated (M11.12).
      storedProfile = profile({ displayName: 'Nala', yearsOfExperience: 0 });

      await service.search(query({ q: 'java' }), USER_ID);

      expect(calls[0].profile).toBeNull();
    });

    /**
     * M11.12 — `yearsOfExperience` was written by the profile form and read by
     * nothing. It now ranks, but only above zero: the default a profile holds
     * before anyone touches it must not acquire a ranking term on its own, and
     * at zero the term would restate what `juniorScore` already contributes.
     */
    it('ranks by stated years even when nothing else is filled in', async () => {
      storedProfile = profile({ yearsOfExperience: 2 });

      await service.search(query({ q: 'java' }), USER_ID);

      expect(calls[0].profile).toEqual({
        technologies: [],
        locations: [],
        countryCodes: [],
        yearsOfExperience: 2,
      });
    });

    it('passes zero years as null rather than as a figure', async () => {
      storedProfile = profile({ technologies: ['java'], yearsOfExperience: 0 });

      await service.search(query({ q: 'java' }), USER_ID);

      expect(calls[0].profile?.yearsOfExperience).toBeNull();
    });

    it.each([
      ['technologies only', { technologies: ['java'] }],
      ['locations only', { locations: ['Berlin'] }],
      ['country codes only', { countryCodes: ['DE'] }],
    ])('ranks by a profile that fills in %s', async (_name, saved) => {
      storedProfile = profile(saved);

      await service.search(query({ q: 'java' }), USER_ID);

      expect(calls[0].profile).not.toBeNull();
    });

    // An explicit ordering is the answer the caller asked for. Blending a
    // preference into it is the same failure as ignoring a filter — and the
    // profile is not even fetched, because it could not change the result.
    it.each([SearchSort.JUNIOR_SCORE, SearchSort.POSTED_AT])(
      'does not apply profile fit to sort=%s',
      async (sort) => {
        storedProfile = profile({ technologies: ['java'] });

        await service.search(query({ q: 'java', sort }), USER_ID);

        expect(calls[0].profile).toBeNull();
        expect(profileLookups).toEqual([]);
      },
    );

    // Ranking only. Two users must get the same jobs in different orders, so
    // nothing the profile carries may reach the filter set.
    it('never turns a profile into a filter', async () => {
      storedProfile = profile({
        technologies: ['java'],
        locations: ['Berlin'],
        countryCodes: ['DE'],
      });

      await service.search(query({ q: 'java' }), USER_ID);

      expect(calls[0].filters).toEqual(NO_FILTERS);
    });
  });

  // The rank orders the page and is only comparable inside one result set, so
  // publishing it would invite a client to compare two searches by it.
  it('never exposes the internal text rank', async () => {
    page = { rows: [resultRow()], total: 1 };

    const response = await service.search(query());

    expect(response.items[0]).not.toHaveProperty('rank');
    expect(response.items[0]).not.toHaveProperty('searchVector');
  });
});
