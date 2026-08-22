import { DEMO_USER, SEED_JOBS } from '../../../prisma/seed-data';
import { TECHNOLOGY_SLUGS, extractTechnologies } from './technologies';

describe('extractTechnologies', () => {
  it('returns canonical slugs, sorted', () => {
    expect(
      extractTechnologies(
        'Junior Backend Developer (m/f/d)',
        'Stack: Java, Spring Boot, PostgreSQL.',
      ),
    ).toEqual(['java', 'postgresql', 'spring', 'spring-boot']);
  });

  it('scans the title as well as the description', () => {
    expect(
      extractTechnologies('Junior Java Developer', 'Join our team.'),
    ).toEqual(['java']);
  });

  it('is case and spelling insensitive within an entry', () => {
    expect(extractTechnologies(null, 'POSTGRES')).toEqual(['postgresql']);
    expect(extractTechnologies(null, 'PostgreSQL')).toEqual(['postgresql']);
    expect(extractTechnologies(null, 'Node.js')).toEqual(['nodejs']);
    expect(extractTechnologies(null, 'nodejs')).toEqual(['nodejs']);
  });

  it('emits a slug once however many of its aliases hit', () => {
    expect(
      extractTechnologies(null, 'We use Node.js — nodejs everywhere.'),
    ).toEqual(['nodejs']);
  });

  it('does not match a shorter name inside a longer one', () => {
    expect(extractTechnologies(null, 'We write JavaScript.')).toEqual([
      'javascript',
    ]);
    expect(extractTechnologies(null, 'GitLab CI runs the pipeline.')).toEqual([
      'gitlab-ci',
    ]);
    expect(extractTechnologies(null, 'The backend is ASP.NET Core.')).toEqual([
      'aspnet',
    ]);
  });

  it('keeps names that contain symbols', () => {
    expect(extractTechnologies(null, 'C# and .NET on the backend.')).toEqual([
      'csharp',
      'dotnet',
    ]);
    expect(extractTechnologies(null, 'Some C++ experience helps.')).toEqual([
      'cpp',
    ]);
  });

  it('matches a name at the end of a sentence', () => {
    expect(extractTechnologies(null, 'The frontend is React.')).toEqual([
      'react',
    ]);
  });

  it('does not invent slugs from ordinary prose', () => {
    expect(
      extractTechnologies(
        'Software Developer',
        'We go to conferences in Berlin and the rest of the team is agile.',
      ),
    ).toEqual([]);
  });

  it('recognizes Go only through unambiguous spellings', () => {
    expect(extractTechnologies(null, 'Golang experience is a plus.')).toEqual([
      'golang',
    ]);
    expect(extractTechnologies('Go Developer (m/f/d)', null)).toEqual([
      'golang',
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(extractTechnologies()).toEqual([]);
    expect(extractTechnologies(null, null)).toEqual([]);
    expect(extractTechnologies('', '   ')).toEqual([]);
  });

  describe('against the fixture source payloads', () => {
    const cases: ReadonlyArray<readonly [string, string, readonly string[]]> = [
      [
        'Graduate Software Engineer',
        'Graduate programme for career starters. TypeScript, Node.js, PostgreSQL.',
        ['nodejs', 'postgresql', 'typescript'],
      ],
      [
        'Werkstudent Softwareentwicklung (m/w/d)',
        'Technologien: Python, Django, PostgreSQL.',
        ['django', 'postgresql', 'python'],
      ],
      [
        'Entry Level Frontend Developer',
        'Entry level frontend role. Angular, TypeScript, RxJS.',
        ['angular', 'rxjs', 'typescript'],
      ],
    ];

    it.each(cases)('%s', (title, description, expected) => {
      expect(extractTechnologies(title, description)).toEqual([...expected]);
    });
  });

  describe('against the seeded canonical values', () => {
    // prisma/seed-data.ts carries hand-written slugs. A slug this dictionary
    // cannot emit is a split facet value: the seeded rows and the ingested ones
    // would never match the same GIN containment filter.
    const seeded = new Set<string>([
      ...SEED_JOBS.flatMap((job) => job.technologies),
      ...DEMO_USER.technologies,
    ]);

    it.each([...seeded].sort())('%s is a dictionary slug', (slug) => {
      expect(TECHNOLOGY_SLUGS).toContain(slug);
    });
  });
});
