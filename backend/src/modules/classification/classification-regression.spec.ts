import type { JuniorLevel } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { SCORE_BANDS, scoreFor } from '../scoring/score-bands';
import {
  REGRESSION_CORPUS,
  type RegressionCase,
} from './__fixtures__/regression-corpus';
import { ClassificationModule } from './classification.module';
import type { ClassificationResult } from './junior-classifier';
import { RuleBasedClassifier } from './rule-based.classifier';
import type { Signal, SignalCode } from './signal';

/**
 * M8.6 — the regression net (`docs/CLASSIFICATION-CORPUS.md`).
 *
 * Every case in `regression-corpus.ts` is run through the real stage: the module's
 * `RuleBasedClassifier`, driving the real experience and signal extractors, and then
 * M8.5's scorer. Nothing is stubbed, because the point of the corpus is to fail when
 * the *product's answer* changes, wherever in the stage the change was made.
 *
 * It runs under `npm test`, which is what CI runs (M12.5), so a rule change that
 * moves an answer cannot be merged without the diff saying so out loud.
 */

const LEVELS: readonly JuniorLevel[] = [
  'ENTRY_LEVEL',
  'LIKELY_ENTRY_LEVEL',
  'AMBIGUOUS',
  'EXPERIENCED',
  'CLEARLY_EXPERIENCED',
];

function codesOf(result: ClassificationResult): SignalCode[] {
  return [...result.positiveSignals, ...result.negativeSignals].map(
    (signal) => signal.code,
  );
}

function allSignals(result: ClassificationResult): readonly Signal[] {
  return [...result.positiveSignals, ...result.negativeSignals];
}

describe('classification regression corpus (M8.6)', () => {
  let classifier: RuleBasedClassifier;

  const classify = (testCase: RegressionCase): Promise<ClassificationResult> =>
    classifier.classify({
      title: testCase.title,
      description: testCase.description,
    });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ClassificationModule],
    }).compile();

    classifier = moduleRef.get(RuleBasedClassifier);
  });

  describe('every case', () => {
    it.each(REGRESSION_CORPUS)('$ref: $why', async (testCase) => {
      const result = await classify(testCase);

      expect(result.level).toBe(testCase.level);
      expect(result.minYears).toBe(testCase.minYears);
      expect(result.maxYears).toBe(testCase.maxYears);

      // Every named signal is found. A right answer reached without the evidence
      // that explains it is one rule change away from being a wrong one.
      const found = codesOf(result);
      for (const code of testCase.signals) {
        expect(found).toContain(code);
      }
      for (const code of testCase.absent ?? []) {
        expect(found).not.toContain(code);
      }

      // The score agrees with the band, end to end through M8.5.
      const band = SCORE_BANDS[result.level];
      const score = scoreFor(result);
      expect(score).toBeGreaterThanOrEqual(band.min);
      expect(score).toBeLessThanOrEqual(band.max);
    });
  });

  /**
   * `PRODUCT.md` §7: a classification is shown with the sentences that produced it.
   * A signal quoting text the posting does not contain would be a fabricated
   * explanation, which is worse than no explanation at all.
   */
  describe('the evidence', () => {
    it.each(REGRESSION_CORPUS)(
      '$ref quotes the description verbatim',
      async (testCase) => {
        const result = await classify(testCase);

        for (const signal of allSignals(result)) {
          expect(signal.evidence.length).toBeGreaterThan(0);
          expect(testCase.description).toContain(signal.evidence);
        }
      },
    );

    it.each(REGRESSION_CORPUS)(
      '$ref reports each signal once',
      async (testCase) => {
        const codes = codesOf(await classify(testCase));

        expect(codes).toHaveLength(new Set(codes).size);
      },
    );
  });

  /**
   * The corpus is only a net if it covers the ground. These are assertions about the
   * *corpus itself*, so that a future edit cannot quietly reduce it to the cases that
   * happen to pass.
   */
  describe('coverage', () => {
    it('carries every level, in both languages where the level can occur', () => {
      for (const level of LEVELS) {
        const cases = REGRESSION_CORPUS.filter(
          (testCase) => testCase.level === level,
        );

        expect(cases.length).toBeGreaterThanOrEqual(2);
        expect(new Set(cases.map((testCase) => testCase.language)).size).toBe(
          2,
        );
      }
    });

    it('carries the adversarial cases in both directions', () => {
      // A junior-looking posting that is not, and an experienced-looking one that is.
      const juniorTitleExperiencedBody = REGRESSION_CORPUS.filter(
        (testCase) =>
          /junior|graduate|einstieg/i.test(testCase.title) &&
          (testCase.level === 'EXPERIENCED' ||
            testCase.level === 'CLEARLY_EXPERIENCED'),
      );
      const seniorTitleJuniorBody = REGRESSION_CORPUS.filter(
        (testCase) =>
          /senior|lead|staff|principal/i.test(testCase.title) &&
          (testCase.level === 'ENTRY_LEVEL' ||
            testCase.level === 'LIKELY_ENTRY_LEVEL'),
      );

      expect(juniorTitleExperiencedBody.length).toBeGreaterThanOrEqual(2);
      expect(seniorTitleJuniorBody.length).toBeGreaterThanOrEqual(1);
    });

    it('carries ambiguous cases, which are an answer and not a gap', () => {
      const ambiguous = REGRESSION_CORPUS.filter(
        (testCase) => testCase.level === 'AMBIGUOUS',
      );

      expect(ambiguous.length).toBeGreaterThanOrEqual(4);
    });

    it('is written as full postings rather than one-line fixtures', () => {
      for (const testCase of REGRESSION_CORPUS) {
        expect(testCase.description.length).toBeGreaterThan(200);
        expect(testCase.why.length).toBeGreaterThan(40);
      }
    });

    it('gives every case a unique ref, so a failure names one posting', () => {
      const refs = REGRESSION_CORPUS.map((testCase) => testCase.ref);

      expect(refs).toHaveLength(new Set(refs).size);
    });
  });
});
