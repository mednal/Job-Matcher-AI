import { SEED_JOBS } from '../../../prisma/seed-data';
import { SIGNAL_CORPUS } from './__fixtures__/signal-corpus';
import { extractExperience } from './experience';
import type { SignalCode } from './signal';
import { extractSignals, NUMERIC_SIGNAL_CODES } from './signals';

const codesOf = (signals: readonly { code: SignalCode }[]): SignalCode[] =>
  signals.map((signal) => signal.code);

describe('extractSignals', () => {
  describe('the fixture corpus', () => {
    it.each(SIGNAL_CORPUS)('$name', (testCase) => {
      const result = extractSignals({
        description: testCase.text,
        experience: extractExperience(testCase.text),
      });

      expect(codesOf(result.positive).sort()).toEqual(
        [...testCase.positive].sort(),
      );
      expect(codesOf(result.negative).sort()).toEqual(
        [...testCase.negative].sort(),
      );

      for (const [code, evidence] of Object.entries(testCase.evidence ?? {})) {
        const signal = [...result.positive, ...result.negative].find(
          (candidate) => candidate.code === code,
        );
        expect(signal?.evidence).toBe(evidence);
      }
    });

    // The milestone's Verify line. Evidence that was rewritten is worthless: a user
    // reads it as a quotation of the posting, and a bad classification is argued with
    // by looking at it.
    it('every excerpt is present in the description, unmodified', () => {
      for (const testCase of SIGNAL_CORPUS) {
        const result = extractSignals({
          description: testCase.text,
          experience: extractExperience(testCase.text),
        });

        for (const signal of [...result.positive, ...result.negative]) {
          expect(signal.evidence.length).toBeGreaterThan(0);
          expect(testCase.text).toContain(signal.evidence);
        }
      }
    });

    it('gives every signal the weight its code carries, with the sign of its list', () => {
      for (const testCase of SIGNAL_CORPUS) {
        const result = extractSignals({
          description: testCase.text,
          experience: extractExperience(testCase.text),
        });

        for (const signal of result.positive) {
          expect(signal.weight).toBeGreaterThan(0);
        }
        for (const signal of result.negative) {
          expect(signal.weight).toBeLessThan(0);
        }
      }
    });
  });

  describe('the numeric signal', () => {
    const numeric = (text: string): SignalCode[] => {
      const result = extractSignals({
        description: text,
        experience: extractExperience(text),
      });
      return codesOf([...result.positive, ...result.negative]).filter((code) =>
        code.includes('YEARS'),
      );
    };

    it.each([
      ['0-1 years of commercial experience', 'ZERO_TO_ONE_YEARS'],
      ['0-2 years of professional experience', 'ZERO_TO_TWO_YEARS'],
      ['1-2 years of experience with Python', 'ONE_TO_TWO_YEARS'],
      ['up to 2 years of experience', 'UP_TO_TWO_YEARS'],
      ['at least 3 years of experience', 'REQUIRES_3_PLUS_YEARS'],
      ['4+ years of experience', 'REQUIRES_3_PLUS_YEARS'],
      ['5+ years of professional experience', 'REQUIRES_5_PLUS_YEARS'],
      ['We require 8+ years of experience', 'REQUIRES_5_PLUS_YEARS'],
    ])('%s → %s', (text, code) => {
      expect(numeric(text)).toEqual([code]);
    });

    it('says nothing about a range that decides nothing', () => {
      expect(numeric('1 to 4 years of experience')).toEqual([]);
    });

    it('says nothing when the posting states no figure', () => {
      expect(numeric('We care about how you think.')).toEqual([]);
    });

    it('quotes the highest floor, not the friendliest one', () => {
      const text =
        'We welcome 0-2 years of experience.\nYou will need 5+ years of professional experience with Java.';
      const result = extractSignals({
        description: text,
        experience: extractExperience(text),
      });

      expect(codesOf(result.negative)).toContain('REQUIRES_5_PLUS_YEARS');
      expect(codesOf(result.positive)).not.toContain('ZERO_TO_TWO_YEARS');
      expect(
        result.negative.find(
          (signal) => signal.code === 'REQUIRES_5_PLUS_YEARS',
        )?.evidence,
      ).toBe('5+ years of professional experience');
    });

    it('leads the list, because that is the order the classifier weighs it in', () => {
      const text =
        'This is an entry level position. We ask for 0-1 years of experience.';
      const result = extractSignals({
        description: text,
        experience: extractExperience(text),
      });

      expect(result.positive[0]?.code).toBe('ZERO_TO_ONE_YEARS');
    });

    // M8.3 weighs phrase evidence *within* the side the figure chose, which means
    // it has to be able to leave the figure's own signal out of that sum. It does
    // that with NUMERIC_SIGNAL_CODES, so a code added to the numeric half without
    // being added to the set would be counted twice by the classifier.
    it('declares every code the numeric half can emit', () => {
      expect([...NUMERIC_SIGNAL_CODES].sort()).toEqual(
        [
          'ONE_TO_TWO_YEARS',
          'REQUIRES_3_PLUS_YEARS',
          'REQUIRES_5_PLUS_YEARS',
          'UP_TO_TWO_YEARS',
          'ZERO_TO_ONE_YEARS',
          'ZERO_TO_TWO_YEARS',
        ].sort(),
      );

      for (const testCase of SIGNAL_CORPUS) {
        const result = extractSignals({
          description: testCase.text,
          experience: extractExperience(testCase.text),
        });

        const numericSignals = [...result.positive, ...result.negative].filter(
          (signal) => NUMERIC_SIGNAL_CODES.has(signal.code),
        );
        expect(numericSignals.length).toBeLessThanOrEqual(1);
      }
    });

    it('is not emitted when the bounds carry no mention to quote', () => {
      const result = extractSignals({
        description: 'Nothing to see here.',
        experience: { minYears: 5, maxYears: null, mentions: [] },
      });

      expect(result.negative).toEqual([]);
    });

    it('is absent when no requirement is supplied at all', () => {
      const result = extractSignals({ description: '5+ years of experience' });
      expect(codesOf(result.negative)).not.toContain('REQUIRES_5_PLUS_YEARS');
    });
  });

  describe('the seeded corpus', () => {
    // prisma/seed-data.ts carries hand-written signals on ten jobs, and Phases 6–8
    // are checked against them. The codes are the vocabulary this stage speaks, so
    // the assertion is the strong one: on every seeded description the extractor
    // finds the codes a person put there by hand, and the one place it finds more is
    // named rather than tolerated.
    const ADDITIONAL: ReadonlyMap<string, readonly SignalCode[]> = new Map([
      // "…bieten eine strukturierte Einarbeitung mit festem Mentor." The seed counts
      // that sentence once, as TRAINING_PROVIDED. A named mentor is a second claim
      // and the extractor reads it as one; the seed is the terser judgement, not the
      // more correct one.
      ['Junior Softwareentwickler (m/w/d)', ['MENTORING_OFFERED']],
    ]);

    it('finds only evidence the description actually contains', () => {
      for (const job of SEED_JOBS) {
        const result = extractSignals({
          description: job.description,
          experience: extractExperience(job.description),
        });

        for (const signal of [...result.positive, ...result.negative]) {
          expect(signal.evidence.length).toBeGreaterThan(0);
          expect(job.description).toContain(signal.evidence);
        }
      }
    });

    it.each(SEED_JOBS)('$title', (job) => {
      const result = extractSignals({
        description: job.description,
        experience: extractExperience(job.description),
      });

      const seeded = [
        ...job.classification.positiveSignals,
        ...job.classification.negativeSignals,
      ].map((signal) => signal.code);

      expect(codesOf([...result.positive, ...result.negative]).sort()).toEqual(
        [...seeded, ...(ADDITIONAL.get(job.title) ?? [])].sort(),
      );
    });

    it('puts a seeded signal in the list its weight belongs to', () => {
      for (const job of SEED_JOBS) {
        const result = extractSignals({
          description: job.description,
          experience: extractExperience(job.description),
        });
        const seededNegative = new Set(
          job.classification.negativeSignals.map((signal) => signal.code),
        );

        for (const signal of result.positive) {
          expect(seededNegative.has(signal.code)).toBe(false);
        }
      }
    });
  });
});
