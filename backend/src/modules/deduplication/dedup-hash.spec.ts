import { createHash } from 'crypto';
import { dedupHash } from './dedup-hash';
import { toNormalizedTitle } from './normalized-title';
import { SEED_JOBS } from '../../../prisma/seed-data';

const base = {
  companySlug: 'aurelia-systems',
  normalizedTitle: 'backend developer java',
  countryCode: 'IE',
};

describe('dedupHash', () => {
  it('is a sha256 hex digest', () => {
    expect(dedupHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(dedupHash(base)).toBe(dedupHash({ ...base }));
  });

  describe('every input changes the hash', () => {
    it.each([
      ['companySlug', { ...base, companySlug: 'aurelia-labs' }],
      ['normalizedTitle', { ...base, normalizedTitle: 'frontend developer' }],
      ['countryCode', { ...base, countryCode: 'DE' }],
    ])('%s', (_field, changed) => {
      expect(dedupHash(changed)).not.toBe(dedupHash(base));
    });
  });

  describe('countryCode', () => {
    it('is compared case-insensitively', () => {
      // `DATABASE.md` §6 fixes the column as uppercase alpha-2, so a source that
      // wrote "ie" must land on the same canonical job as one that wrote "IE".
      expect(dedupHash({ ...base, countryCode: 'ie' })).toBe(dedupHash(base));
    });

    it('treats null and empty as the same unknown', () => {
      expect(dedupHash({ ...base, countryCode: null })).toBe(
        dedupHash({ ...base, countryCode: '' }),
      );
    });

    it('does not let an unknown country match a known one', () => {
      expect(dedupHash({ ...base, countryCode: null })).not.toBe(
        dedupHash(base),
      );
    });
  });

  /**
   * `prisma/seed.ts` already writes this exact format. It is matched byte for byte
   * rather than re-invented: the seeded jobs are the corpus the pipeline is checked
   * against, and a different layout would mean an ingested posting quietly opened a
   * second `Job` beside its seeded twin instead of joining it.
   */
  describe('agrees with the seed', () => {
    const seedFormula = (job: {
      companySlug: string;
      normalizedTitle: string;
      countryCode: string | null;
    }): string =>
      createHash('sha256')
        .update(
          `${job.companySlug}|${job.normalizedTitle}|${job.countryCode ?? ''}`,
          'utf8',
        )
        .digest('hex');

    it.each(SEED_JOBS.map((job) => [job.ref, job] as const))(
      '%s',
      (_ref, job) => {
        expect(
          dedupHash({
            companySlug: job.companySlug,
            normalizedTitle: job.normalizedTitle,
            countryCode: job.countryCode,
          }),
        ).toBe(seedFormula(job));
      },
    );

    it('reaches the seeded hash from the raw title alone', () => {
      // The whole tier 2 path, end to end: a posting carrying the seed's title,
      // slug and country hashes onto the seeded job's key. This is what makes an
      // ingested duplicate of a seeded job attach instead of splitting.
      for (const job of SEED_JOBS) {
        expect(
          dedupHash({
            companySlug: job.companySlug,
            normalizedTitle: toNormalizedTitle(job.title),
            countryCode: job.countryCode,
          }),
        ).toBe(seedFormula(job));
      }
    });
  });

  /**
   * The separator is a literal `|`, which is safe only because none of the three
   * inputs can contain one. If a future rule change lets `|` through, this fails —
   * which is the point.
   */
  it('cannot have content shift across a field boundary', () => {
    expect(
      dedupHash({
        companySlug: 'acme',
        normalizedTitle: 'data engineer',
        countryCode: 'DE',
      }),
    ).not.toBe(
      dedupHash({
        companySlug: 'acme|data',
        normalizedTitle: 'engineer',
        countryCode: 'DE',
      }),
    );
  });
});
