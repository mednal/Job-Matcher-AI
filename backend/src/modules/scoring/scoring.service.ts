import { Injectable } from '@nestjs/common';
import type { ClassificationResult } from '../classification/junior-classifier';
import { scoreFor } from './score-bands';

/**
 * M8.5 — the junior suitability score (`ARCHITECTURE.md` §6.5).
 *
 * The service is the injectable face of `scoreFor`; the rules are in
 * `score-bands.ts` and are pure. There is deliberately nothing else in it: §6.5 says
 * the mapping is "deterministic and pure, therefore trivially unit-testable", and a
 * service that cached, logged or looked anything up would give that away.
 *
 * `ClassificationResult` is imported **as a type only**. The runtime dependency
 * arrow of §4.3 runs `classification → scoring` and this module provides nothing to
 * classification's imports — `import type` is erased at compile time, so the arrow
 * still points one way. The alternative, restating the result shape here, would put
 * the evidence vocabulary in two places; `ScorableClassification` in
 * `score-bands.ts` states the subset the rules actually read instead.
 */
@Injectable()
export class ScoringService {
  /**
   * How well this posting's stated requirements match a candidate with roughly 0–2
   * years of experience, as an integer from 0 to 100.
   *
   * Never a probability of being hired, interviewed or answered — see §6.5 and the
   * note at the top of `score-bands.ts`.
   */
  score(classification: ClassificationResult): number {
    return scoreFor(classification);
  }
}
