import { readFileSync } from 'fs';
import { join } from 'path';
import { SEED_JOBS } from '../../../prisma/seed-data';
import {
  DEFAULT_LANGUAGE,
  STOPWORD_SETS,
  detectLanguage,
  textSearchConfiguration,
} from './language';

const FIXTURE_DIR = join(__dirname, '__fixtures__');

function readFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8').replace(/\r\n/g, '\n');
}

describe('detectLanguage', () => {
  it('detects German prose', () => {
    expect(
      detectLanguage({
        description:
          'Wir suchen einen Berufseinsteiger für unser Team in Berlin. Keine Berufserfahrung erforderlich.',
      }),
    ).toBe('de');
  });

  it('detects English prose', () => {
    expect(
      detectLanguage({
        description:
          'We are looking for a career starter to join our platform team in Berlin.',
      }),
    ).toBe('en');
  });

  it('is not confused by the English technology names inside a German posting', () => {
    // The reason stopwords are counted rather than words in general: a German
    // posting's nouns are frequently English, but its function words never are.
    expect(
      detectLanguage({
        title: 'Junior Frontend Developer (m/w/d)',
        description:
          'Du entwickelst Features in TypeScript mit Angular und Node.js und schreibst Tests mit Jest. Deine Skills im Frontend Development sind uns wichtig.',
      }),
    ).toBe('de');
  });

  describe('the fallback', () => {
    it('is English for a language that is neither', () => {
      expect(
        detectLanguage({
          description:
            "Nous recherchons un développeur junior pour rejoindre notre équipe à Paris. Aucune expérience professionnelle n'est requise.",
        }),
      ).toBe('en');
      expect(
        detectLanguage({
          description:
            'Buscamos un desarrollador junior para incorporarse a nuestro equipo en Madrid.',
        }),
      ).toBe('en');
    });

    it('is English for empty, absent and evidence-free input', () => {
      expect(detectLanguage({})).toBe(DEFAULT_LANGUAGE);
      expect(detectLanguage({ title: null, description: null })).toBe('en');
      expect(detectLanguage({ description: '   ' })).toBe('en');
      expect(detectLanguage({ description: '2026 · 100% · 0-2' })).toBe('en');
    });

    it('is English when the two languages tie', () => {
      // A tie is not a coin flip: the English stemmer is the safer wrong answer.
      expect(detectLanguage({ description: 'the und' })).toBe('en');
    });

    it('holds against a single stray German token in English prose', () => {
      expect(
        detectLanguage({
          description:
            'Our office is on Unter den Linden. We are looking for a junior developer.',
        }),
      ).toBe('en');
    });
  });

  describe('a declared language', () => {
    it('wins over the text', () => {
      expect(
        detectLanguage({
          description:
            'We are looking for a junior developer to join our team.',
          declared: 'de',
        }),
      ).toBe('de');
    });

    it('is accepted in the forms sources publish it in', () => {
      expect(detectLanguage({ declared: 'de-DE' })).toBe('de');
      expect(detectLanguage({ declared: 'de_AT' })).toBe('de');
      expect(detectLanguage({ declared: 'DE' })).toBe('de');
      expect(detectLanguage({ declared: ' en-GB ' })).toBe('en');
    });

    it('falls back to the text when it names an unsupported language', () => {
      // `fr` still has to be stored as one of the two configurations that exist,
      // and the posting's own text is the better evidence for which one.
      expect(
        detectLanguage({
          declared: 'fr',
          description: 'Wir suchen einen Junior Entwickler für unser Team.',
        }),
      ).toBe('de');
      expect(detectLanguage({ declared: 'fr' })).toBe('en');
      expect(detectLanguage({ declared: '' })).toBe('en');
    });
  });

  describe('against the seeded corpus', () => {
    // prisma/seed-data.ts carries hand-written `language` values on ten postings,
    // three of them German, including the adversarial "Junior title / 5+ years
    // body" case. Detection that disagrees with the seed means the seeded rows and
    // the ingested ones would be stemmed by different configurations.
    it.each(SEED_JOBS.map((job) => [job.ref, job] as const))(
      '%s',
      (_ref, job) => {
        expect(
          detectLanguage({ title: job.title, description: job.description }),
        ).toBe(job.language);
      },
    );
  });

  describe('against the M6.1 fixture corpus', () => {
    // Real converted markup rather than hand-written prose, and a second origin:
    // these came from the text stage, so they exercise the input this stage
    // actually receives in the pipeline.
    it('reads the German WYSIWYG fixture as German', () => {
      expect(
        detectLanguage({
          description: readFixture('wysiwyg-german.expected.txt'),
        }),
      ).toBe('de');
    });

    it('reads the English fixtures as English', () => {
      expect(
        detectLanguage({
          description: readFixture('wysiwyg-english.expected.txt'),
        }),
      ).toBe('en');
      expect(
        detectLanguage({
          description: readFixture('plain-text-bullets.expected.txt'),
        }),
      ).toBe('en');
    });
  });

  it('counts no token for both languages', () => {
    // The scoring is only meaningful if the two sets are disjoint: a token in both
    // would be counted as German evidence and never as English, silently biasing
    // every comparison.
    const shared = [...STOPWORD_SETS.de].filter((word) =>
      STOPWORD_SETS.en.has(word),
    );
    expect(shared).toEqual([]);
  });
});

describe('textSearchConfiguration', () => {
  it('mirrors the CASE expression in the searchVector generated column', () => {
    // migration 20260821190950: 'de' -> german, everything else -> english.
    expect(textSearchConfiguration('de')).toBe('german');
    expect(textSearchConfiguration('en')).toBe('english');
    expect(textSearchConfiguration('fr')).toBe('english');
    expect(textSearchConfiguration('')).toBe('english');
  });

  it('tolerates the padding a char(2) column can hand back', () => {
    expect(textSearchConfiguration('DE')).toBe('german');
    expect(textSearchConfiguration('de ')).toBe('german');
  });
});
