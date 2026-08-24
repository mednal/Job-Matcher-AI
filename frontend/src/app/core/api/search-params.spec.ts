import { toPageParams, toSearchParams } from './search-params';

describe('toSearchParams', () => {
  it('sends nothing at all for an empty query', () => {
    expect(toSearchParams({}).toString()).toBe('');
  });

  it('repeats the key for every list value rather than joining them', () => {
    const params = toSearchParams({ technologies: ['java', 'kotlin'] });

    expect(params.getAll('technologies')).toEqual(['java', 'kotlin']);
  });

  it('never comma-joins locations, where a comma is part of the value', () => {
    const params = toSearchParams({ locations: ['Berlin, Germany', 'Remote'] });

    expect(params.getAll('locations')).toEqual(['Berlin, Germany', 'Remote']);
    expect(params.toString()).toContain('Berlin,%20Germany');
  });

  it('serializes every declared filter under the name the API expects', () => {
    const params = toSearchParams({
      q: 'angular developer',
      technologies: ['typescript'],
      locations: ['Lisbon'],
      countryCode: 'PT',
      workplaceType: ['REMOTE', 'HYBRID'],
      employmentType: ['FULL_TIME'],
      juniorLevel: ['ENTRY_LEVEL', 'LIKELY_ENTRY_LEVEL'],
      minJuniorScore: 60,
      maxYearsRequired: 2,
      postedWithinDays: 30,
      sort: 'juniorScore',
      page: 2,
      pageSize: 50,
    });

    expect(params.get('q')).toBe('angular developer');
    expect(params.get('countryCode')).toBe('PT');
    expect(params.getAll('workplaceType')).toEqual(['REMOTE', 'HYBRID']);
    expect(params.getAll('employmentType')).toEqual(['FULL_TIME']);
    expect(params.getAll('juniorLevel')).toEqual(['ENTRY_LEVEL', 'LIKELY_ENTRY_LEVEL']);
    expect(params.get('minJuniorScore')).toBe('60');
    expect(params.get('maxYearsRequired')).toBe('2');
    expect(params.get('postedWithinDays')).toBe('30');
    expect(params.get('sort')).toBe('juniorScore');
    expect(params.get('page')).toBe('2');
    expect(params.get('pageSize')).toBe('50');
  });

  // The backend runs `forbidNonWhitelisted`, and a declared-but-empty parameter
  // reads as a filter no job satisfies. Cleared fields must vanish.
  it('drops cleared and whitespace-only values instead of sending empty filters', () => {
    const params = toSearchParams({
      q: '   ',
      technologies: [],
      locations: ['', '  '],
      countryCode: '',
    });

    expect(params.toString()).toBe('');
  });

  it('keeps zero, which is a filter and not an absent value', () => {
    const params = toSearchParams({ minJuniorScore: 0, maxYearsRequired: 0 });

    expect(params.get('minJuniorScore')).toBe('0');
    expect(params.get('maxYearsRequired')).toBe('0');
  });

  it('drops a non-finite number rather than sending a 400 the user cannot act on', () => {
    const params = toSearchParams({ page: Number.NaN, pageSize: Number.POSITIVE_INFINITY });

    expect(params.toString()).toBe('');
  });

  it('omits sort when unset, so the API default stays the only definition of it', () => {
    expect(toSearchParams({ q: 'react' }).has('sort')).toBe(false);
  });
});

describe('toPageParams', () => {
  it('sends only the pagination the caller set', () => {
    expect(toPageParams({}).toString()).toBe('');
    expect(toPageParams({ page: 3 }).toString()).toBe('page=3');
    expect(toPageParams({ page: 1, pageSize: 20 }).toString()).toBe('page=1&pageSize=20');
  });
});
