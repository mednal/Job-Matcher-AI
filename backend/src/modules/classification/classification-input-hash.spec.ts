import { classificationInputHash } from './classification-input-hash';

/**
 * M8.4 — the cache key.
 *
 * Two properties matter, and they pull in opposite directions: the hash must be
 * stable enough that an unchanged posting never re-classifies, and sensitive enough
 * that anything the classifier reads changing produces a different key. Everything
 * below is one of those two.
 */
describe('classificationInputHash', () => {
  const INPUT = {
    title: 'Junior Backend Developer (m/w/d)',
    description: 'Entry level position. Training provided.',
  };

  it('is a sha256 hex digest', () => {
    expect(classificationInputHash(INPUT)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across calls — this is what stops re-classification', () => {
    expect(classificationInputHash(INPUT)).toBe(classificationInputHash(INPUT));
    expect(classificationInputHash({ ...INPUT })).toBe(
      classificationInputHash(INPUT),
    );
  });

  it('changes when the description changes', () => {
    expect(
      classificationInputHash({
        ...INPUT,
        description: 'We require 5+ years of professional experience.',
      }),
    ).not.toBe(classificationInputHash(INPUT));
  });

  it('changes when the title changes, because `decideLevel` reads it', () => {
    expect(
      classificationInputHash({ ...INPUT, title: 'Senior Backend Developer' }),
    ).not.toBe(classificationInputHash(INPUT));
  });

  it('separates a missing description from an empty one', () => {
    const absent = classificationInputHash({ title: INPUT.title });
    const nulled = classificationInputHash({
      title: INPUT.title,
      description: null,
    });
    const empty = classificationInputHash({
      title: INPUT.title,
      description: '',
    });

    expect(absent).toBe(nulled);
    expect(empty).not.toBe(absent);
  });

  it('cannot collide by moving text across the field boundary', () => {
    // With a printable separator, or none, these two would hash identically.
    expect(
      classificationInputHash({ title: 'Junior', description: 'Developer' }),
    ).not.toBe(
      classificationInputHash({ title: 'JuniorDeveloper', description: '' }),
    );
  });
});
