import {
  canonicalValuesFrom,
  changedCanonicalValues,
  pickCanonicalPosting,
  type CanonicalCandidate,
  type CanonicalValues,
} from './canonical-values';

function candidate(
  overrides: Partial<CanonicalCandidate> = {},
): CanonicalCandidate {
  return {
    id: 'posting-1',
    isActive: true,
    firstSeenAt: new Date('2026-08-20T09:00:00.000Z'),
    title: 'Junior Backend Developer (m/w/d)',
    companyName: 'Nordwind Software GmbH',
    location: 'Berlin, Germany',
    workplaceType: 'HYBRID',
    employmentType: 'FULL_TIME',
    language: 'de',
    description: 'Entry level position. Training provided.',
    technologies: ['java', 'spring-boot'],
    postedAt: new Date('2026-08-19T09:00:00.000Z'),
    ...overrides,
  };
}

function current(overrides: Partial<CanonicalValues> = {}): CanonicalValues {
  const winner = candidate();
  return {
    ...canonicalValuesFrom(winner, {
      effectivePostedAt: new Date('2026-08-19T09:00:00.000Z'),
    }),
    ...overrides,
  };
}

describe('pickCanonicalPosting', () => {
  it('takes the posting with the richest description', () => {
    const thin = candidate({ id: 'posting-thin', description: 'Short ad.' });
    const rich = candidate({
      id: 'posting-rich',
      description: 'A much longer advertisement, with responsibilities listed.',
    });

    expect(pickCanonicalPosting([thin, rich])?.id).toBe('posting-rich');
  });

  it('is independent of the order the postings arrive in', () => {
    // The property that matters most: tiers 2 and 3 attach postings in whatever
    // order a run fetched them, and the canonical copy must not flip run to run.
    const postings = [
      candidate({ id: 'a', description: 'aaa' }),
      candidate({ id: 'b', description: 'bbbbb' }),
      candidate({ id: 'c', description: 'cc' }),
    ];

    const forwards = pickCanonicalPosting(postings)?.id;
    const backwards = pickCanonicalPosting([...postings].reverse())?.id;

    expect(forwards).toBe('b');
    expect(backwards).toBe('b');
  });

  it('breaks a length tie on firstSeenAt, so the displayed copy does not churn', () => {
    const incumbent = candidate({
      id: 'posting-old',
      description: 'Same length!',
      firstSeenAt: new Date('2026-08-01T09:00:00.000Z'),
    });
    const newcomer = candidate({
      id: 'posting-new',
      description: 'Same length!',
      firstSeenAt: new Date('2026-08-20T09:00:00.000Z'),
    });

    expect(pickCanonicalPosting([newcomer, incumbent])?.id).toBe('posting-old');
  });

  it('breaks a firstSeenAt tie on id, so the answer is always total', () => {
    const seenAt = new Date('2026-08-20T09:00:00.000Z');
    const b = candidate({ id: 'b', description: 'tie', firstSeenAt: seenAt });
    const a = candidate({ id: 'a', description: 'tie', firstSeenAt: seenAt });

    expect(pickCanonicalPosting([b, a])?.id).toBe('a');
    expect(pickCanonicalPosting([a, b])?.id).toBe('a');
  });

  it('prefers a live posting over a richer retired one', () => {
    // A posting the source stopped listing (M5.6) advertises a vacancy that is no
    // longer on that board; a live sibling's copy is the one to show.
    const retired = candidate({
      id: 'posting-retired',
      isActive: false,
      description:
        'A very long advertisement that nobody can apply to anymore.',
    });
    const live = candidate({
      id: 'posting-live',
      description: 'Short but live.',
    });

    expect(pickCanonicalPosting([retired, live])?.id).toBe('posting-live');
  });

  it('falls back to the retired postings when none is live', () => {
    // Better to keep describing something than to blank a row a user may have
    // saved. The M5.6 sweep is what retires the job itself.
    const older = candidate({
      id: 'posting-a',
      isActive: false,
      description: 'Short.',
    });
    const richer = candidate({
      id: 'posting-b',
      isActive: false,
      description: 'A considerably longer description than its sibling.',
    });

    expect(pickCanonicalPosting([older, richer])?.id).toBe('posting-b');
  });

  it('returns null for a cluster with no postings', () => {
    expect(pickCanonicalPosting([])).toBeNull();
  });
});

describe('canonicalValuesFrom', () => {
  it('never returns an identity column', () => {
    // `dedupHash` is UNIQUE and derived from `companySlug | normalizedTitle |
    // countryCode`. Letting any of the four move would make a job's own key stop
    // describing it — and a recomputed hash can collide with one already stored.
    const values = canonicalValuesFrom(candidate(), {
      effectivePostedAt: new Date('2026-08-19T09:00:00.000Z'),
    });

    expect(Object.keys(values).sort()).toEqual([
      'companyName',
      'description',
      'effectivePostedAt',
      'employmentType',
      'language',
      'location',
      'postedAt',
      'technologies',
      'title',
      'workplaceType',
    ]);
  });

  it('takes effectivePostedAt from the chosen posting when it has a date', () => {
    const values = canonicalValuesFrom(
      candidate({ postedAt: new Date('2026-08-21T09:00:00.000Z') }),
      { effectivePostedAt: new Date('2026-08-19T09:00:00.000Z') },
    );

    expect(values.effectivePostedAt).toEqual(
      new Date('2026-08-21T09:00:00.000Z'),
    );
  });

  it('keeps the existing effectivePostedAt when the posting has no date', () => {
    // Falling back to "now" would jump the job to the top of the recency sort
    // because its canonical copy changed, which is not new information.
    const values = canonicalValuesFrom(candidate({ postedAt: null }), {
      effectivePostedAt: new Date('2026-08-19T09:00:00.000Z'),
    });

    expect(values.postedAt).toBeNull();
    expect(values.effectivePostedAt).toEqual(
      new Date('2026-08-19T09:00:00.000Z'),
    );
  });

  it('copies technologies rather than aliasing the posting array', () => {
    const source = ['java', 'spring-boot'];
    const values = canonicalValuesFrom(candidate({ technologies: source }), {
      effectivePostedAt: new Date('2026-08-19T09:00:00.000Z'),
    });

    values.technologies.push('kafka');
    expect(source).toEqual(['java', 'spring-boot']);
  });
});

describe('changedCanonicalValues', () => {
  it('reports no change when the job already carries the chosen values', () => {
    // The common case — a re-ingested posting nobody edited — must cost no write.
    expect(changedCanonicalValues(candidate(), current())).toBeNull();
  });

  it('reports the new values when the description moved', () => {
    const winner = candidate({ description: 'A richer advertisement.' });

    expect(changedCanonicalValues(winner, current())).toMatchObject({
      description: 'A richer advertisement.',
    });
  });

  it('treats a null field arriving where a value stood as a change', () => {
    const winner = candidate({ location: null, workplaceType: null });

    expect(changedCanonicalValues(winner, current())).toMatchObject({
      location: null,
      workplaceType: null,
    });
  });

  it('notices a reordering of technologies', () => {
    // Unlike `postingContentHash`, order counts here: the column keeps the
    // extractor's order and the UI renders it, so a reordering is visible.
    const winner = candidate({ technologies: ['spring-boot', 'java'] });

    expect(changedCanonicalValues(winner, current())).toMatchObject({
      technologies: ['spring-boot', 'java'],
    });
  });

  it('compares dates by instant, not by identity', () => {
    const winner = candidate({
      postedAt: new Date('2026-08-19T09:00:00.000Z'),
    });

    expect(changedCanonicalValues(winner, current())).toBeNull();
  });
});
