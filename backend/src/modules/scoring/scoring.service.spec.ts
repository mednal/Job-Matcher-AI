import { Test } from '@nestjs/testing';
import { ClassificationModule } from '../classification/classification.module';
import {
  JUNIOR_SCORER,
  type JuniorScorer,
} from '../classification/classification.tokens';
import type { ClassificationResult } from '../classification/junior-classifier';
import { RuleBasedClassifier } from '../classification/rule-based.classifier';
import { createSignal } from '../classification/signal';
import { SCORE_BANDS, scoreFor } from './score-bands';
import { ScoringModule } from './scoring.module';
import { ScoringService } from './scoring.service';

/**
 * The service is a two-line wrapper over `score-bands.ts`, so what is worth testing
 * is not the arithmetic — `score-bands.spec.ts` has that — but the wiring: that the
 * `JUNIOR_SCORER` seam M8.4 opened is now filled by *this* implementation, so
 * `JobClassification.score` cannot be written by a second, quietly different scale.
 */

const RESULT: ClassificationResult = {
  classifierVersion: 'rules-1.0',
  level: 'ENTRY_LEVEL',
  minYears: 0,
  maxYears: 1,
  positiveSignals: [createSignal('ENTRY_LEVEL_STATED', 'entry level position')],
  negativeSignals: [],
};

describe('ScoringService', () => {
  let scoring: ScoringService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ScoringModule],
    }).compile();

    scoring = moduleRef.get(ScoringService);
  });

  it('resolves from a module that needs nothing else', () => {
    expect(scoring).toBeInstanceOf(ScoringService);
  });

  it('answers with the band rules, and nothing of its own', () => {
    expect(scoring.score(RESULT)).toBe(scoreFor(RESULT));
  });

  it('scores a classification result inside its level band', () => {
    const band = SCORE_BANDS.ENTRY_LEVEL;
    const score = scoring.score(RESULT);

    expect(score).toBeGreaterThanOrEqual(band.min);
    expect(score).toBeLessThanOrEqual(band.max);
  });
});

describe('the JUNIOR_SCORER binding (M8.4 → M8.5)', () => {
  let scorer: JuniorScorer;
  let classifier: RuleBasedClassifier;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ClassificationModule],
    }).compile();

    scorer = moduleRef.get<JuniorScorer>(JUNIOR_SCORER);
    classifier = moduleRef.get(RuleBasedClassifier);
  });

  it('is bound, so persistence no longer writes the placeholder zero', () => {
    expect(typeof scorer).toBe('function');
    expect(scorer(RESULT)).toBe(scoreFor(RESULT));
    expect(scorer(RESULT)).toBeGreaterThan(0);
  });

  // End to end through the two milestones: text in, a number out, still in band.
  it('scores what the real classifier decided', async () => {
    const result = await classifier.classify({
      title: 'Junior Java Developer',
      description:
        'We are looking for a Junior Java Developer. Requirements: 5+ years of professional experience with Java.',
    });

    expect(result.level).toBe('CLEARLY_EXPERIENCED');
    expect(scorer(result)).toBeLessThanOrEqual(
      SCORE_BANDS.CLEARLY_EXPERIENCED.max,
    );
  });
});
