import { Injectable } from '@nestjs/common';
import { ExperienceExtractionService } from './experience-extraction.service';
import type {
  ClassificationInput,
  ClassificationResult,
  JuniorClassifier,
} from './junior-classifier';
import { decideLevel } from './level-rules';
import { SignalExtractionService } from './signal-extraction.service';

/**
 * Stage 1 of §6.4: the rule-based classifier, which **always runs**.
 *
 * It is the whole of classification until M8.7 decides whether an AI stage ships at
 * all, and it stays the whole of it whenever that stage is disabled, missing a key
 * or failing. That is the reason it exists in this shape: an LLM is an enhancement
 * here, never a dependency.
 *
 * The class is only a composition — the three stages it drives are each pure and
 * tested on their own:
 *
 *  1. `ExperienceExtractionService` reads the numeric requirement (M8.1),
 *  2. `SignalExtractionService` turns that plus the phrases into the two evidence
 *     lists (M8.2), taking the requirement as an argument rather than extracting it
 *     again, which is the seam M8.2 left open here so one pass produces both,
 *  3. `decideLevel` applies §6.4's precedence to the result (M8.3).
 *
 * `classifierVersion` is stamped on every result. `JobClassification` is keyed by
 * `(jobId, classifierVersion, inputHash)`, so a rule change that keeps this string
 * would overwrite the history it is supposed to be evaluated against. Change it
 * whenever the rules or the weights move.
 */
export const RULE_BASED_CLASSIFIER_VERSION = 'rules-1.0';

@Injectable()
export class RuleBasedClassifier implements JuniorClassifier {
  readonly version = RULE_BASED_CLASSIFIER_VERSION;

  constructor(
    private readonly experienceExtraction: ExperienceExtractionService,
    private readonly signalExtraction: SignalExtractionService,
  ) {}

  /**
   * The level a posting supports, with the evidence that produced it and the figure
   * it stated. Async to satisfy the interface, not because anything here waits: the
   * rules are pure and synchronous, and `Promise.resolve` is honest about that.
   *
   * A posting with no description is not an error. It classifies on its title alone,
   * which under `decideLevel` can only ever reach `LIKELY_ENTRY_LEVEL` or
   * `EXPERIENCED` — never a confident answer from a title.
   */
  classify(input: ClassificationInput): Promise<ClassificationResult> {
    const experience = this.experienceExtraction.extract(input.description);
    const signals = this.signalExtraction.extract({
      description: input.description,
      experience,
    });

    return Promise.resolve({
      classifierVersion: this.version,
      level: decideLevel({
        title: input.title,
        minYears: experience.minYears,
        maxYears: experience.maxYears,
        positiveSignals: signals.positive,
        negativeSignals: signals.negative,
      }),
      minYears: experience.minYears,
      maxYears: experience.maxYears,
      positiveSignals: signals.positive,
      negativeSignals: signals.negative,
    });
  }
}
