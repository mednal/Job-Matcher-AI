import {
  postingContentHash,
  type HashablePosting,
} from './posting-content-hash';

function posting(overrides: Partial<HashablePosting> = {}): HashablePosting {
  return {
    url: 'https://fixtures.juniorjob.local/jobs/fx-001',
    title: 'Junior Backend Developer (m/f/d)',
    companyName: 'Nordwind Software GmbH',
    companySlug: 'nordwind-software',
    location: 'Berlin, Germany',
    countryCode: 'DE',
    workplaceType: 'HYBRID',
    employmentType: 'FULL_TIME',
    language: 'de',
    description: 'Entry level position. Training provided.',
    technologies: ['java', 'spring-boot', 'postgresql'],
    postedAt: new Date('2026-08-20T09:00:00.000Z'),
    ...overrides,
  };
}

describe('postingContentHash', () => {
  it('is stable across calls for identical content', () => {
    expect(postingContentHash(posting())).toBe(postingContentHash(posting()));
  });

  it('returns a hex sha256', () => {
    expect(postingContentHash(posting())).toMatch(/^[0-9a-f]{64}$/);
  });

  describe('every mutable column is covered', () => {
    // A column missing from the hash is a column a re-ingestion would never
    // correct: the row would hash equal, be reported UNCHANGED, and keep the stale
    // value forever. Each case here is one such column.
    const changes: ReadonlyArray<[string, Partial<HashablePosting>]> = [
      ['url', { url: 'https://fixtures.juniorjob.local/jobs/fx-001?v=2' }],
      ['title', { title: 'Backend Developer (m/f/d)' }],
      ['companyName', { companyName: 'Nordwind Software AG' }],
      ['companySlug', { companySlug: 'nordwind' }],
      ['location', { location: 'Hamburg, Germany' }],
      ['countryCode', { countryCode: 'AT' }],
      ['workplaceType', { workplaceType: 'REMOTE' }],
      ['employmentType', { employmentType: 'INTERNSHIP' }],
      ['language', { language: 'en' }],
      ['description', { description: 'Entry level position.' }],
      ['technologies', { technologies: ['java', 'spring-boot'] }],
      ['postedAt', { postedAt: new Date('2026-08-21T09:00:00.000Z') }],
    ];

    it.each(changes)('changes when %s changes', (_column, override) => {
      expect(postingContentHash(posting(override))).not.toBe(
        postingContentHash(posting()),
      );
    });
  });

  it('distinguishes a null optional field from an empty string', () => {
    expect(postingContentHash(posting({ location: null }))).not.toBe(
      postingContentHash(posting({ location: '' })),
    );
  });

  it('treats technologies as a set, not a sequence', () => {
    expect(
      postingContentHash(
        posting({ technologies: ['postgresql', 'java', 'spring-boot'] }),
      ),
    ).toBe(postingContentHash(posting()));
  });

  it('does not let content shift across a field boundary', () => {
    // With a printable separator these two would concatenate to the same string.
    const a = posting({ title: 'Developer', companyName: 'X GmbH' });
    const b = posting({ title: 'Developer X', companyName: 'GmbH' });
    expect(postingContentHash(a)).not.toBe(postingContentHash(b));
  });
});
