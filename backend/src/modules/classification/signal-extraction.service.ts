import { Injectable } from '@nestjs/common';
import {
  extractSignals,
  type ExtractedSignals,
  type SignalExtractionInput,
} from './signals';

/**
 * The signal stage of classification (M8.2, `ARCHITECTURE.md` §6.4).
 *
 * The same seam `ExperienceExtractionService` is: the work is pure and lives in
 * `signals.ts`, so it is unit-testable with no container, and this class is what
 * `RuleBasedClassifier` (M8.3) injects.
 *
 * It deliberately does **not** call `ExperienceExtractionService` itself, even though
 * it needs its output. M8.3 has to hold the numeric requirement anyway — it writes
 * `minYears` / `maxYears` onto the classification and applies §6.4's precedence rule
 * with it — so extracting it here as well would run the same pass twice and leave two
 * places that could disagree about the bounds. The classifier runs the extractor once
 * and hands the result to `extract`.
 */
@Injectable()
export class SignalExtractionService {
  /**
   * The evidence a posting carries, split into the two lists `JobClassification`
   * stores. Every signal carries a verbatim excerpt; a signal that could not quote
   * the posting is not emitted.
   */
  extract(input: SignalExtractionInput): ExtractedSignals {
    return extractSignals(input);
  }
}
