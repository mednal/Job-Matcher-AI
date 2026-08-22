import {
  MIN_CONFIRMABLE_TOKENS,
  descriptionSimilarity,
  descriptionTokens,
} from './description-similarity';

/** ~30 distinct tokens — comfortably past the confirmable floor. */
const LISTING = `
  We are hiring a backend developer for our payments platform in Berlin.
  You will work with Java, Spring Boot and PostgreSQL, ship features to production
  every week, and review pull requests together with your team. Training and a
  mentor are provided for the first six months. Applications from recent graduates
  are welcome.
`;

/** The same vacancy as another board wrote it: same copy, different wrapper. */
const LISTING_REPOSTED = `
  Backend developer wanted for our payments platform in Berlin. You will work with
  Java, Spring Boot and PostgreSQL, ship features to production every week and
  review pull requests with your team. A mentor is provided for the first six
  months. Recent graduates welcome. We offer a public transport ticket and thirty
  vacation days.
`;

/** A different vacancy at the same company, sharing the boilerplate wrapper. */
const OTHER_ROLE = `
  We are hiring a data engineer for our analytics platform in Berlin. You will build
  streaming pipelines with Kafka, dbt and Snowflake, own the warehouse schema, and
  partner with analysts across the company. We offer a public transport ticket and
  thirty vacation days.
`;

describe('descriptionTokens', () => {
  it('folds and lowercases by the same rules as the other canonical values', () => {
    // `foldToAscii` is shared with `companySlug` and `normalizedTitle` on purpose:
    // a board that lost its encoding must still match its properly encoded twin.
    expect(descriptionTokens('Müller Softwarehaus')).toEqual(
      descriptionTokens('MUELLER softwarehaus'),
    );
  });

  it('drops tokens shorter than three characters', () => {
    // In both supported languages these are function words, present in every
    // posting, so they inflate the overlap of two unrelated ads.
    expect([...descriptionTokens('we go to the big office')]).toEqual([
      'the',
      'big',
      'office',
    ]);
  });

  it('counts a repeated word once', () => {
    expect(descriptionTokens('kubernetes kubernetes kubernetes').size).toBe(1);
  });

  it('returns nothing for absent text', () => {
    expect(descriptionTokens(null).size).toBe(0);
    expect(descriptionTokens('').size).toBe(0);
  });
});

describe('descriptionSimilarity', () => {
  it('scores a description against itself as 1', () => {
    expect(descriptionSimilarity(LISTING, LISTING)).toBe(1);
  });

  it('is symmetric', () => {
    expect(descriptionSimilarity(LISTING, LISTING_REPOSTED)).toBe(
      descriptionSimilarity(LISTING_REPOSTED, LISTING),
    );
  });

  it('scores the same vacancy reposted well above the same-company boilerplate', () => {
    const same = descriptionSimilarity(LISTING, LISTING_REPOSTED);
    const different = descriptionSimilarity(LISTING, OTHER_ROLE);

    // The gap is what tier 3's threshold sits in. Both numbers move when the
    // tokenizer changes; the ordering must not.
    expect(same).toBeGreaterThan(0.5);
    expect(different).toBeLessThan(0.5);
  });

  it('scores unrelated vocabularies at 0', () => {
    const a =
      'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima';
    const b =
      'mike november oscar papa quebec romeo sierra tango uniform victor whisky xray';

    expect(descriptionSimilarity(a, b)).toBe(0);
  });

  it('returns null — not 0 — when either side is too thin to confirm anything', () => {
    const thin = 'Entry level position. Training provided.';
    expect(descriptionTokens(thin).size).toBeLessThan(MIN_CONFIRMABLE_TOKENS);

    // "Unknown", not "different": a handful of tokens can reach any score by
    // accident, and tier 3 must not merge on an accident. The caller splits.
    expect(descriptionSimilarity(thin, LISTING)).toBeNull();
    expect(descriptionSimilarity(LISTING, thin)).toBeNull();
    expect(descriptionSimilarity(thin, thin)).toBeNull();
  });

  it('does not let a long description swallow a short generic one', () => {
    // The overlap coefficient would score this near 1, because the short side is
    // almost a subset of the long side. Jaccard is chosen precisely so it does not.
    const short = [...descriptionTokens(LISTING)].slice(0, 14).join(' ');
    const score = descriptionSimilarity(short, LISTING);

    expect(score).not.toBeNull();
    expect(score as number).toBeLessThan(0.5);
  });
});
