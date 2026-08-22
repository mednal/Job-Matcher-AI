import { toNormalizedTitle } from './normalized-title';
import { SEED_JOBS } from '../../../prisma/seed-data';

describe('toNormalizedTitle', () => {
  it('lowercases', () => {
    expect(toNormalizedTitle('Software Engineer')).toBe('software engineer');
  });

  it('folds diacritics the way companySlug does', () => {
    // Both values are hashed into `dedupHash`, so a source that lost its encoding
    // has to normalize onto the same key as one that did not.
    expect(toNormalizedTitle('Softwareentwickler für Backend')).toBe(
      toNormalizedTitle('Softwareentwickler fuer Backend'),
    );
  });

  it('preserves word order', () => {
    expect(toNormalizedTitle('Developer Support')).not.toBe(
      toNormalizedTitle('Support Developer'),
    );
  });

  it('collapses repeated whitespace', () => {
    expect(toNormalizedTitle('  Data   Engineer  ')).toBe('data engineer');
  });

  describe('seniority words', () => {
    it.each([
      ['Junior Java Developer', 'java developer'],
      ['Senior Java Developer', 'java developer'],
      ['Lead Platform Engineer', 'platform engineer'],
      ['Principal Backend Engineer', 'backend engineer'],
      ['Staff Software Engineer', 'software engineer'],
      ['Jr. Frontend Developer', 'frontend developer'],
      ['Sr Frontend Developer', 'frontend developer'],
      ['Leitender Entwickler', 'entwickler'],
    ])('%s -> %s', (input, expected) => {
      expect(toNormalizedTitle(input)).toBe(expected);
    });

    it('strips them anywhere in the title, not only in front', () => {
      expect(toNormalizedTitle('Backend Developer Junior')).toBe(
        'backend developer',
      );
    });

    it('keeps a title that is nothing but seniority words', () => {
      // An empty normalized title would hash every such posting at one company onto
      // a single `dedupHash`, which is the collision the rule exists to avoid.
      expect(toNormalizedTitle('Senior')).toBe('senior');
      expect(toNormalizedTitle('Junior (m/w/d)')).toBe('junior');
    });

    it('does not strip the words that name a role or a programme', () => {
      // `graduate` and `working student` are what the job *is*. Folding them away
      // would merge a graduate programme with an open-level vacancy — and the seed
      // corpus pins `Graduate Software Engineer` unchanged.
      expect(toNormalizedTitle('Graduate Software Engineer')).toBe(
        'graduate software engineer',
      );
      expect(toNormalizedTitle('Working Student Backend')).toBe(
        'working student backend',
      );
      expect(toNormalizedTitle('Werkstudent Softwareentwicklung')).toBe(
        'werkstudent softwareentwicklung',
      );
    });

    it('does not strip a word that merely contains one', () => {
      expect(toNormalizedTitle('Leadership Program Engineer')).toBe(
        'leadership program engineer',
      );
    });
  });

  describe('gender markers', () => {
    it.each([
      ['Softwareentwickler (m/w/d)', 'softwareentwickler'],
      ['Softwareentwickler (w/m/d)', 'softwareentwickler'],
      ['Software Engineer (m/f/d)', 'software engineer'],
      ['Software Engineer (m/f/x)', 'software engineer'],
      ['Entwickler [m/w/d]', 'entwickler'],
      ['Entwickler (gn)', 'entwickler'],
      ['Entwickler (m/w/divers)', 'entwickler'],
      ['Engineer (all genders)', 'engineer'],
      ['Développeur (h/f)', 'developpeur'],
    ])('%s -> %s', (input, expected) => {
      expect(toNormalizedTitle(input)).toBe(expected);
    });

    it('handles the unbracketed spelling', () => {
      expect(toNormalizedTitle('Softwareentwickler m/w/d Backend')).toBe(
        'softwareentwickler backend',
      );
    });

    it('keeps a bracketed group that is not a marker', () => {
      // The specialization in brackets is the difference between two real
      // vacancies at one company, so it must survive into the hash.
      expect(toNormalizedTitle('Backend Developer (Java)')).toBe(
        'backend developer java',
      );
      expect(toNormalizedTitle('Developer (Remote)')).toBe('developer remote');
    });

    it('keeps a slash-joined pair that is not a marker', () => {
      expect(toNormalizedTitle('C/C++ Developer')).toBe('c c developer');
      expect(toNormalizedTitle('Frontend/Backend Developer')).toBe(
        'frontend backend developer',
      );
    });
  });

  describe('punctuation', () => {
    it('becomes a word boundary', () => {
      expect(toNormalizedTitle('Java-Entwickler, Backend')).toBe(
        'java entwickler backend',
      );
    });

    it('leaves nothing when a title is punctuation only', () => {
      // The caller has to treat this as "no title" rather than hash it.
      expect(toNormalizedTitle('---')).toBe('');
    });
  });

  it('returns an empty string for an absent title', () => {
    expect(toNormalizedTitle(null)).toBe('');
    expect(toNormalizedTitle(undefined)).toBe('');
    expect(toNormalizedTitle('')).toBe('');
  });

  it('is idempotent', () => {
    const once = toNormalizedTitle('Junior Softwareentwickler (m/w/d) Backend');
    expect(toNormalizedTitle(once)).toBe(once);
  });

  /**
   * The seeded corpus is the reference (`MILESTONES.md` — "the corpus Phases 6–8
   * should be checked against"). Its `normalizedTitle` values were written by hand
   * before this function existed, so agreeing with all ten is the real check that
   * the rule implemented here is the rule the rest of the project assumed.
   */
  describe('the seeded corpus', () => {
    it.each(SEED_JOBS.map((job) => [job.ref, job.title, job.normalizedTitle]))(
      '%s: %s',
      (_ref, title, expected) => {
        expect(toNormalizedTitle(title)).toBe(expected);
      },
    );
  });
});
