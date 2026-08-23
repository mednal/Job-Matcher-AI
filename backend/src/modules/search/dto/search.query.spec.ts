// PaginationQuery uses @Type, which reads design-time metadata; the Nest runtime
// loads this in main.ts, a bare Jest run does not.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  MAX_FILTER_VALUES,
  MAX_POSTED_WITHIN_DAYS,
  MAX_SEARCH_QUERY_LENGTH,
  MAX_YEARS_REQUIRED,
  SearchQuery,
  SearchSort,
} from './search.query';
import { MAX_PAGE_SIZE } from '../../../common/dto/pagination.query';

function parse(query: Record<string, unknown>): SearchQuery {
  return plainToInstance(SearchQuery, query, {
    enableImplicitConversion: false,
  });
}

function errorsFor(query: Record<string, unknown>): string[] {
  return validateSync(parse(query), {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).map((error) => error.property);
}

describe('SearchQuery', () => {
  it('defaults to the first page at the shared page size', () => {
    const parsed = parse({});

    expect(parsed.q).toBeUndefined();
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
  });

  it('trims and collapses whitespace inside the query', () => {
    expect(parse({ q: '  junior   java  ' }).q).toBe('junior java');
  });

  it('accepts a query at the length cap and rejects one past it', () => {
    expect(errorsFor({ q: 'a'.repeat(MAX_SEARCH_QUERY_LENGTH) })).toEqual([]);
    expect(errorsFor({ q: 'a'.repeat(MAX_SEARCH_QUERY_LENGTH + 1) })).toEqual([
      'q',
    ]);
  });

  // Inherited from PaginationQuery, asserted here because /jobs/search is the
  // endpoint the cap exists for (docs/ARCHITECTURE.md §8.1).
  it('rejects a page size past the shared cap', () => {
    expect(errorsFor({ pageSize: MAX_PAGE_SIZE + 1 })).toEqual(['pageSize']);
  });

  // M9.5 adds profile-fit. Until it exists, forbidNonWhitelisted must reject its
  // parameters: one the backend silently ignores returns jobs the user excluded,
  // or an order they did not ask for.
  it('rejects a parameter that has not been implemented yet', () => {
    expect(errorsFor({ q: 'java', profileFit: 'true' })).toEqual([
      'profileFit',
    ]);
  });

  describe('list filters', () => {
    it('accepts a repeated key as the array it is', () => {
      expect(parse({ technologies: ['java', 'kotlin'] }).technologies).toEqual([
        'java',
        'kotlin',
      ]);
    });

    it('wraps a single value in an array', () => {
      expect(parse({ technologies: 'java' }).technologies).toEqual(['java']);
    });

    // A comma cannot occur inside a slug or an enum member, so splitting is safe
    // there — and a client that sends `java,kotlin` unsplit would get zero
    // results with nothing to explain why.
    it('splits comma-separated slugs and enum members', () => {
      expect(parse({ technologies: 'java, kotlin' }).technologies).toEqual([
        'java',
        'kotlin',
      ]);
      expect(parse({ workplaceType: 'REMOTE,HYBRID' }).workplaceType).toEqual([
        'REMOTE',
        'HYBRID',
      ]);
    });

    // "Berlin, Germany" is one place, not two, so free text is never split.
    it('never splits a free-text location on its comma', () => {
      expect(parse({ locations: 'Berlin, Germany' }).locations).toEqual([
        'Berlin, Germany',
      ]);
    });

    it('reads an enum member case-insensitively', () => {
      expect(parse({ workplaceType: 'remote' }).workplaceType).toEqual([
        'REMOTE',
      ]);
      expect(errorsFor({ juniorLevel: 'entry_level' })).toEqual([]);
    });

    it('lowercases a technology slug to the stored vocabulary', () => {
      expect(parse({ technologies: 'Spring-Boot' }).technologies).toEqual([
        'spring-boot',
      ]);
    });

    // An empty parameter is a user who selected nothing, so it must not become a
    // filter that no job can satisfy.
    it('drops empty entries', () => {
      expect(parse({ technologies: '' }).technologies).toEqual([]);
      expect(parse({ technologies: ['java', '', ' '] }).technologies).toEqual([
        'java',
      ]);
    });

    it('rejects a value outside the enum', () => {
      expect(errorsFor({ workplaceType: 'ANYWHERE' })).toEqual([
        'workplaceType',
      ]);
      expect(errorsFor({ employmentType: 'FREELANCE' })).toEqual([
        'employmentType',
      ]);
      expect(errorsFor({ juniorLevel: 'JUNIOR' })).toEqual(['juniorLevel']);
    });

    it('rejects more values than the cap', () => {
      const values = Array.from({ length: MAX_FILTER_VALUES + 1 }, (_, i) =>
        String(i),
      );

      expect(errorsFor({ technologies: values })).toEqual(['technologies']);
    });
  });

  describe('countryCode', () => {
    it('uppercases and accepts an ISO-3166 alpha-2 code', () => {
      expect(parse({ countryCode: 'de' }).countryCode).toBe('DE');
      expect(errorsFor({ countryCode: 'de' })).toEqual([]);
    });

    it.each(['DEU', 'D', 'ZZ'])('rejects %s', (code) => {
      expect(errorsFor({ countryCode: code })).toEqual(['countryCode']);
    });
  });

  describe('numeric filters', () => {
    it('parses the numbers query strings deliver as strings', () => {
      const parsed = parse({
        minJuniorScore: '70',
        maxYearsRequired: '2',
        postedWithinDays: '30',
      });

      expect(parsed.minJuniorScore).toBe(70);
      expect(parsed.maxYearsRequired).toBe(2);
      expect(parsed.postedWithinDays).toBe(30);
    });

    // The score is a 0-100 suitability score; a bound outside it is a mistake,
    // not a wider search.
    it.each([
      ['minJuniorScore', -1],
      ['minJuniorScore', 101],
      ['minJuniorScore', 70.5],
      ['maxYearsRequired', -1],
      ['maxYearsRequired', MAX_YEARS_REQUIRED + 1],
      ['postedWithinDays', 0],
      ['postedWithinDays', MAX_POSTED_WITHIN_DAYS + 1],
    ])('rejects %s = %s', (field, value) => {
      expect(errorsFor({ [field]: value })).toEqual([field]);
    });

    // `maxYearsRequired=0` is the sharpest form of the product's core question,
    // so it must survive @IsOptional rather than being read as "not sent".
    it('keeps a zero bound', () => {
      expect(parse({ maxYearsRequired: '0' }).maxYearsRequired).toBe(0);
      expect(parse({ minJuniorScore: '0' }).minJuniorScore).toBe(0);
      expect(errorsFor({ maxYearsRequired: 0, minJuniorScore: 0 })).toEqual([]);
    });
  });

  describe('sort', () => {
    // §8.1's default, and the product's: "jobs I should realistically consider"
    // rather than "jobs, newest first".
    it('defaults to relevance', () => {
      expect(parse({}).sort).toBe(SearchSort.RELEVANCE);
      expect(parse({ q: 'java' }).sort).toBe(SearchSort.RELEVANCE);
    });

    it.each(Object.values(SearchSort))('accepts %s', (sort) => {
      expect(parse({ sort }).sort).toBe(sort);
      expect(errorsFor({ sort })).toEqual([]);
    });

    // Unlike the enum facets, these are matched exactly: no case fold round-trips
    // `juniorScore`, so accepting `juniorscore` would mean keeping two spellings.
    it.each(['juniorscore', 'JUNIORSCORE', 'salary', 'postedat'])(
      'rejects %s',
      (sort) => {
        expect(errorsFor({ sort })).toEqual(['sort']);
      },
    );
  });

  it('accepts every filter of ARCHITECTURE.md 8.1 at once', () => {
    expect(
      errorsFor({
        q: 'junior java',
        technologies: ['java', 'spring-boot'],
        locations: ['Berlin'],
        countryCode: 'DE',
        workplaceType: ['REMOTE', 'HYBRID'],
        employmentType: ['FULL_TIME'],
        juniorLevel: ['ENTRY_LEVEL', 'LIKELY_ENTRY_LEVEL'],
        minJuniorScore: 70,
        maxYearsRequired: 2,
        postedWithinDays: 30,
        sort: 'juniorScore',
        page: 2,
        pageSize: 50,
      }),
    ).toEqual([]);
  });

  // D7 removed salary from the schema, so there is nothing to filter on. It must
  // be rejected rather than ignored, or a client will believe it worked.
  it('rejects a salary filter', () => {
    expect(errorsFor({ minSalary: 40000 })).toEqual(['minSalary']);
  });
});
