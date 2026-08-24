import { Params, convertToParamMap } from '@angular/router';
import { SearchQuery } from '../../core/models/search';
import { activeFilterCount, parseSearchQuery, toQueryParams } from './search-query-params';

function parse(params: Params): SearchQuery {
  return parseSearchQuery(convertToParamMap(params));
}

/** A URL carrying every parameter the search takes, in its canonical spelling. */
const FULL_QUERY: SearchQuery = {
  q: 'junior java developer',
  technologies: ['java', 'spring-boot'],
  locations: ['Berlin, Germany', 'Munich'],
  countryCode: 'DE',
  workplaceType: ['REMOTE', 'HYBRID'],
  employmentType: ['FULL_TIME', 'INTERNSHIP'],
  juniorLevel: ['ENTRY_LEVEL', 'LIKELY_ENTRY_LEVEL'],
  minJuniorScore: 70,
  maxYearsRequired: 2,
  postedWithinDays: 30,
  sort: 'juniorScore',
  page: 3,
  pageSize: 50,
};

describe('the URL is the search', () => {
  it('survives the round trip through the address bar', () => {
    expect(parse(toQueryParams(FULL_QUERY))).toEqual(FULL_QUERY);
  });

  it('reads an empty URL as the default search rather than as a filter', () => {
    expect(parse({})).toEqual({});
  });

  it('is unchanged by re-parsing what it wrote', () => {
    const once = toQueryParams(FULL_QUERY);
    expect(toQueryParams(parse(once))).toEqual(once);
  });
});

describe('parseSearchQuery', () => {
  it('reads a single filter without inventing the others', () => {
    expect(parse({ q: 'angular' })).toEqual({ q: 'angular' });
  });

  it('treats a cleared field as no filter at all', () => {
    expect(parse({ q: '   ', technologies: '', locations: [''] })).toEqual({});
  });

  it('collapses the whitespace inside a query, as the backend does', () => {
    expect(parse({ q: '  junior   java  ' }).q).toBe('junior java');
  });

  it('takes repeated keys as one list', () => {
    expect(parse({ technologies: ['java', 'kotlin'] }).technologies).toEqual(['java', 'kotlin']);
  });

  it('lowercases technology slugs into the stored vocabulary', () => {
    expect(parse({ technologies: ['Java', 'Spring-Boot'] }).technologies).toEqual([
      'java',
      'spring-boot',
    ]);
  });

  it('drops a duplicate value rather than filtering for it twice', () => {
    expect(parse({ technologies: ['java', 'JAVA'] }).technologies).toEqual(['java']);
  });

  it('never splits a location on a comma, where a comma is part of the value', () => {
    expect(parse({ locations: 'Berlin, Germany' }).locations).toEqual(['Berlin, Germany']);
  });

  it('cuts a list at the number of values the API accepts', () => {
    const many = Array.from({ length: 30 }, (_, index) => `tech-${index}`);
    expect(parse({ technologies: many }).technologies).toHaveLength(20);
  });

  it('folds the case of a closed-vocabulary member', () => {
    expect(parse({ workplaceType: 'remote' }).workplaceType).toEqual(['REMOTE']);
  });

  it('drops a vocabulary member this build does not know, keeping the rest', () => {
    expect(parse({ juniorLevel: ['ENTRY_LEVEL', 'MADE_UP'], q: 'java' })).toEqual({
      q: 'java',
      juniorLevel: ['ENTRY_LEVEL'],
    });
  });

  it('reads a country code as two uppercase letters', () => {
    expect(parse({ countryCode: 'de' }).countryCode).toBe('DE');
    expect(parse({ countryCode: 'DEU' }).countryCode).toBeUndefined();
    expect(parse({ countryCode: '12' }).countryCode).toBeUndefined();
  });

  it.each([
    ['minJuniorScore', 'abc'],
    ['minJuniorScore', '101'],
    ['minJuniorScore', '-1'],
    ['minJuniorScore', '70.5'],
    ['maxYearsRequired', '51'],
    ['postedWithinDays', '0'],
    ['postedWithinDays', '400'],
    ['page', '0'],
    ['page', '201'],
    ['pageSize', '51'],
  ])('drops %s=%s rather than sending a request the API refuses', (key, value) => {
    expect(parse({ [key]: value })).toEqual({});
  });

  it('keeps a zero, which is a filter and not an absence', () => {
    expect(parse({ minJuniorScore: '0', maxYearsRequired: '0' })).toEqual({
      minJuniorScore: 0,
      maxYearsRequired: 0,
    });
  });

  it('answers the rest of a URL when one parameter is unusable', () => {
    expect(parse({ q: 'java', minJuniorScore: 'abc', workplaceType: 'REMOTE' })).toEqual({
      q: 'java',
      workplaceType: ['REMOTE'],
    });
  });

  it('matches a sort exactly, since the backend has no case fold for it', () => {
    expect(parse({ sort: 'juniorScore' }).sort).toBe('juniorScore');
    expect(parse({ sort: 'juniorscore' }).sort).toBeUndefined();
  });
});

describe('toQueryParams', () => {
  it('writes a value the API defaults to nowhere in the URL', () => {
    expect(toQueryParams({ sort: 'relevance', page: 1, pageSize: 20, q: 'java' })).toEqual({
      q: 'java',
    });
  });

  it('writes the values that are not the default', () => {
    expect(toQueryParams({ sort: 'postedAt', page: 4, pageSize: 50 })).toEqual({
      sort: 'postedAt',
      page: '4',
      pageSize: '50',
    });
  });

  it('writes a list as an array, which the router repeats as one key each', () => {
    expect(toQueryParams({ technologies: ['java', 'kotlin'] })).toEqual({
      technologies: ['java', 'kotlin'],
    });
  });

  it('leaves an emptied filter out, so removing it removes it from the link', () => {
    expect(toQueryParams({ technologies: [], q: undefined })).toEqual({});
  });

  it('writes a zero, which is a filter the URL has to carry', () => {
    expect(toQueryParams({ minJuniorScore: 0 })).toEqual({ minJuniorScore: '0' });
  });
});

describe('activeFilterCount', () => {
  it('counts the filters that narrow the result set', () => {
    expect(activeFilterCount({ workplaceType: ['REMOTE'], minJuniorScore: 60 })).toBe(2);
  });

  it('does not count the search itself, or how the results are presented', () => {
    expect(activeFilterCount({ q: 'java', sort: 'postedAt', page: 2, pageSize: 50 })).toBe(0);
  });

  it('does not count a filter that is present but empty', () => {
    expect(activeFilterCount({ technologies: [] })).toBe(0);
  });
});
