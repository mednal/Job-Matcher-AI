import type { JuniorLevel } from '@prisma/client';
import { SEED_JOBS } from '../../../prisma/seed-data';
import {
  createSignal,
  type Signal,
  type SignalCode,
} from '../classification/signal';
import {
  SCORE_BANDS,
  WEIGHT_SATURATION,
  scoreFor,
  type ScorableClassification,
} from './score-bands';

/**
 * M8.5's Verify line — "unit tests on band boundaries" — plus the two properties
 * that make the number safe to show next to a level: it can never contradict the
 * band it came from, and it is a pure function of the evidence.
 */

/** Levels from most junior to least, which is also the score order. */
const LEVELS: readonly JuniorLevel[] = [
  'ENTRY_LEVEL',
  'LIKELY_ENTRY_LEVEL',
  'AMBIGUOUS',
  'EXPERIENCED',
  'CLEARLY_EXPERIENCED',
];

/** A classification carrying exactly the weight asked for, split by sign. */
function withWeight(
  level: JuniorLevel,
  weight: number,
): ScorableClassification {
  const signal: Signal = {
    code: 'ENTRY_LEVEL_STATED',
    weight,
    evidence: 'x',
  };

  return {
    level,
    positiveSignals: weight > 0 ? [signal] : [],
    negativeSignals: weight < 0 ? [signal] : [],
  };
}

function signals(...codes: SignalCode[]): Signal[] {
  return codes.map((code) => createSignal(code, 'evidence'));
}

describe('scoreFor', () => {
  describe('the bands (§6.5)', () => {
    it('tiles 0-100 with no gap and no overlap', () => {
      const ordered = LEVELS.map((level) => SCORE_BANDS[level]);

      expect(ordered[0].max).toBe(100);
      expect(ordered[ordered.length - 1].min).toBe(0);

      // Walking down the levels, each band starts exactly where the next one ends.
      for (let i = 0; i < ordered.length - 1; i += 1) {
        expect(ordered[i].min).toBe(ordered[i + 1].max + 1);
      }
    });

    it('gives every level a band with room to rank inside it', () => {
      for (const level of LEVELS) {
        expect(SCORE_BANDS[level].max).toBeGreaterThan(SCORE_BANDS[level].min);
      }
    });
  });

  describe('band boundaries', () => {
    it.each(LEVELS)('%s saturates at the bottom of its band', (level) => {
      const band = SCORE_BANDS[level];

      expect(scoreFor(withWeight(level, -WEIGHT_SATURATION))).toBe(band.min);
      // Past saturation the answer stops moving: no pile of evidence leaves the band.
      expect(scoreFor(withWeight(level, -WEIGHT_SATURATION * 10))).toBe(
        band.min,
      );
    });

    it.each(LEVELS)('%s saturates at the top of its band', (level) => {
      const band = SCORE_BANDS[level];

      expect(scoreFor(withWeight(level, WEIGHT_SATURATION))).toBe(band.max);
      expect(scoreFor(withWeight(level, WEIGHT_SATURATION * 10))).toBe(
        band.max,
      );
    });

    it.each(LEVELS)('%s with no evidence lands mid-band', (level) => {
      const band = SCORE_BANDS[level];
      const middle = Math.round((band.min + band.max) / 2);

      expect(
        scoreFor({ level, positiveSignals: [], negativeSignals: [] }),
      ).toBe(middle);
    });

    it('stays inside the band for every weight in range', () => {
      for (const level of LEVELS) {
        const band = SCORE_BANDS[level];

        for (let weight = -200; weight <= 200; weight += 5) {
          const score = scoreFor(withWeight(level, weight));

          expect(score).toBeGreaterThanOrEqual(band.min);
          expect(score).toBeLessThanOrEqual(band.max);
          expect(Number.isInteger(score)).toBe(true);
        }
      }
    });
  });

  describe('the adjustment within a band', () => {
    it('ranks stronger junior evidence higher', () => {
      const stated = scoreFor({
        level: 'ENTRY_LEVEL',
        positiveSignals: signals('ENTRY_LEVEL_STATED'),
        negativeSignals: [],
      });
      const statedAndTrained = scoreFor({
        level: 'ENTRY_LEVEL',
        positiveSignals: signals('ENTRY_LEVEL_STATED', 'TRAINING_PROVIDED'),
        negativeSignals: [],
      });

      expect(statedAndTrained).toBeGreaterThan(stated);
    });

    // The numeric signal is read here, unlike in `level-rules.ts`: the level is
    // already settled, so the figure is just the strongest thing the posting said.
    it('ranks a five-year floor below a three-year one', () => {
      const five = scoreFor({
        level: 'CLEARLY_EXPERIENCED',
        positiveSignals: [],
        negativeSignals: signals('REQUIRES_5_PLUS_YEARS'),
      });
      const three = scoreFor({
        level: 'CLEARLY_EXPERIENCED',
        positiveSignals: [],
        negativeSignals: signals('REQUIRES_3_PLUS_YEARS'),
      });

      expect(five).toBeLessThan(three);
    });

    it('reads both sides, so evidence that cancels out sits mid-band', () => {
      const balanced = scoreFor({
        level: 'AMBIGUOUS',
        positiveSignals: signals('TEAM_MANAGEMENT'),
        negativeSignals: [],
      });
      const silent = scoreFor({
        level: 'AMBIGUOUS',
        positiveSignals: [],
        negativeSignals: [],
      });

      expect(
        scoreFor({
          level: 'AMBIGUOUS',
          positiveSignals: signals('ENTRY_LEVEL_STATED'),
          negativeSignals: signals('TEAM_MANAGEMENT'),
        }),
      ).toBe(silent);
      expect(balanced).toBeLessThan(silent);
    });
  });

  describe('deterministic and pure (§6.5)', () => {
    it('returns the same number for the same evidence', () => {
      const classification: ScorableClassification = {
        level: 'LIKELY_ENTRY_LEVEL',
        positiveSignals: signals('GRADUATES_WELCOME', 'TRAINING_PROVIDED'),
        negativeSignals: signals('ON_CALL_EXPECTED'),
      };

      const scores = Array.from({ length: 5 }, () => scoreFor(classification));

      expect(new Set(scores).size).toBe(1);
    });

    it('does not depend on the order the evidence was found in', () => {
      const positive = signals('ENTRY_LEVEL_STATED', 'TRAINING_PROVIDED');

      expect(
        scoreFor({
          level: 'ENTRY_LEVEL',
          positiveSignals: positive,
          negativeSignals: [],
        }),
      ).toBe(
        scoreFor({
          level: 'ENTRY_LEVEL',
          positiveSignals: [...positive].reverse(),
          negativeSignals: [],
        }),
      );
    });

    it('mutates nothing it is given', () => {
      const classification: ScorableClassification = {
        level: 'AMBIGUOUS',
        positiveSignals: signals('TRAINING_PROVIDED'),
        negativeSignals: signals('ON_CALL_EXPECTED'),
      };
      const snapshot = JSON.stringify(classification);

      scoreFor(classification);

      expect(JSON.stringify(classification)).toBe(snapshot);
    });
  });

  /**
   * The guarantee the UI depends on (§6.5): the number and the band say the same
   * thing, so a card showing 78 next to "Likely entry level" is never a
   * contradiction. Because the bands tile 0-100 it holds by construction — this
   * asserts it end to end anyway, over every neighbouring pair and both extremes of
   * the evidence.
   */
  describe('the score never contradicts the level', () => {
    it('scores a more junior level above a less junior one, whatever the evidence', () => {
      const extremes = [-WEIGHT_SATURATION * 2, 0, WEIGHT_SATURATION * 2];

      for (let i = 0; i < LEVELS.length - 1; i += 1) {
        for (const junior of extremes) {
          for (const senior of extremes) {
            expect(scoreFor(withWeight(LEVELS[i], junior))).toBeGreaterThan(
              scoreFor(withWeight(LEVELS[i + 1], senior)),
            );
          }
        }
      }
    });
  });

  /**
   * The seeded classifications (M2.7) are ten scores a person wrote by hand before
   * this file existed. Reproducing their *bands* is the strongest available check
   * that the scale matches human judgement; the exact numbers are not reproduced and
   * were never meant to be — they are stamped `seed-fixture-1.0`, not `rules-1.0`.
   */
  describe('the seeded fixtures', () => {
    it.each(SEED_JOBS)('$ref scores inside its hand-written band', (job) => {
      const band = SCORE_BANDS[job.classification.level];

      expect(job.classification.score).toBeGreaterThanOrEqual(band.min);
      expect(job.classification.score).toBeLessThanOrEqual(band.max);
    });
  });
});
