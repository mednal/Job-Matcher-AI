import { SearchService } from './search.service';
import {
  NO_FILTERS,
  SearchCriteria,
  SearchPage,
  SearchRepository,
  SearchResultRow,
} from './search.repository';
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
    sourceCount: 2,
    rank: 0.42,
    ...overrides,
  };
}

function query(overrides: Partial<SearchQuery> = {}): SearchQuery {
  return Object.assign(new SearchQuery(), overrides);
}

describe('SearchService', () => {
  let calls: SearchCriteria[];
  let page: SearchPage;
  let service: SearchService;

  beforeEach(() => {
    calls = [];
    page = { rows: [], total: 0 };
    const repository = {
      findPage: (criteria: SearchCriteria) => {
        calls.push(criteria);
        return Promise.resolve(page);
      },
    } as unknown as SearchRepository;
    service = new SearchService(repository);
  });

  it('passes the text query through and translates the page into skip/take', async () => {
    await service.search(query({ q: 'junior java', page: 3, pageSize: 20 }));

    expect(calls).toEqual([
      {
        q: 'junior java',
        filters: NO_FILTERS,
        sort: SearchSort.RELEVANCE,
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
          countryCode: 'DE',
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
        countryCode: 'DE',
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

  // The rank orders the page and is only comparable inside one result set, so
  // publishing it would invite a client to compare two searches by it.
  it('never exposes the internal text rank', async () => {
    page = { rows: [resultRow()], total: 1 };

    const response = await service.search(query());

    expect(response.items[0]).not.toHaveProperty('rank');
    expect(response.items[0]).not.toHaveProperty('searchVector');
  });
});
