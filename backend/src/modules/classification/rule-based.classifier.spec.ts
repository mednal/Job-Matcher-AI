import { Test } from '@nestjs/testing';
import { SEED_JOBS } from '../../../prisma/seed-data';
import { CLASSIFICATION_CORPUS } from './__fixtures__/classification-corpus';
import { ClassificationModule } from './classification.module';
import {
  RULE_BASED_CLASSIFIER_VERSION,
  RuleBasedClassifier,
} from './rule-based.classifier';

describe('RuleBasedClassifier', () => {
  let classifier: RuleBasedClassifier;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ClassificationModule],
    }).compile();

    classifier = moduleRef.get(RuleBasedClassifier);
  });

  it('resolves from the module', () => {
    expect(classifier).toBeInstanceOf(RuleBasedClassifier);
  });

  describe('the adversarial corpus', () => {
    it.each(CLASSIFICATION_CORPUS)('$name', async (testCase) => {
      const result = await classifier.classify({
        title: testCase.title,
        description: testCase.text,
      });

      expect(result.level).toBe(testCase.level);
    });

    // The milestone's Verify line, stated as the milestone states it. The four
    // adversarial cases come out CLEARLY_EXPERIENCED rather than EXPERIENCED, which
    // is the same finding one level stronger: the seeded fixture for this exact
    // posting (`vantage-junior-java`) is CLEARLY_EXPERIENCED too, and a five-year
    // floor is what separates the two levels.
    it('keeps every Junior-titled posting that demands years on the experienced side', () => {
      const adversarial = CLASSIFICATION_CORPUS.filter((testCase) =>
        testCase.pins.startsWith('a stated floor'),
      );
      expect(adversarial.length).toBeGreaterThan(0);

      return Promise.all(
        adversarial.map(async (testCase) => {
          const result = await classifier.classify({
            title: testCase.title,
            description: testCase.text,
          });

          expect(['EXPERIENCED', 'CLEARLY_EXPERIENCED']).toContain(
            result.level,
          );
        }),
      );
    });
  });

  describe('the result', () => {
    it('records the classifier version on every result', async () => {
      expect(classifier.version).toBe(RULE_BASED_CLASSIFIER_VERSION);

      for (const testCase of CLASSIFICATION_CORPUS) {
        const result = await classifier.classify({
          title: testCase.title,
          description: testCase.text,
        });

        expect(result.classifierVersion).toBe(RULE_BASED_CLASSIFIER_VERSION);
      }
    });

    it('carries the experience bounds M8.4 denormalizes onto the job', async () => {
      const result = await classifier.classify({
        title: 'Junior Java Developer',
        description: 'Requirements: 5+ years of professional experience.',
      });

      expect(result).toMatchObject({ minYears: 5, maxYears: null });
    });

    // Nothing may reach the user as a reason without the sentence it came from.
    it('quotes the description verbatim in every signal it reports', async () => {
      for (const testCase of CLASSIFICATION_CORPUS) {
        const result = await classifier.classify({
          title: testCase.title,
          description: testCase.text,
        });

        for (const signal of [
          ...result.positiveSignals,
          ...result.negativeSignals,
        ]) {
          expect(signal.evidence.length).toBeGreaterThan(0);
          expect(testCase.text).toContain(signal.evidence);
        }
      }
    });

    it('classifies a posting with no description on its title alone', async () => {
      const result = await classifier.classify({
        title: 'Junior Developer',
        description: null,
      });

      expect(result).toMatchObject({
        level: 'LIKELY_ENTRY_LEVEL',
        minYears: null,
        maxYears: null,
        positiveSignals: [],
        negativeSignals: [],
      });
    });
  });

  // The seeds are ten hand-written classifications that predate this code (M2.7).
  // Reproducing their levels is the strongest check available that the rules match
  // the judgement a person made, and a disagreement here is a finding either way.
  describe('the seeded fixtures', () => {
    it.each(SEED_JOBS)('$ref is $classification.level', async (job) => {
      const result = await classifier.classify({
        title: job.title,
        description: job.description,
      });

      expect(result.level).toBe(job.classification.level);
    });
  });
});
