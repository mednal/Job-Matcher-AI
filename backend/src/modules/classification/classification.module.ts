import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ScoringModule } from '../scoring/scoring.module';
import { ScoringService } from '../scoring/scoring.service';
import { JUNIOR_SCORER, type JuniorScorer } from './classification.tokens';
import { ExperienceExtractionService } from './experience-extraction.service';
import { JobClassificationService } from './job-classification.service';
import { RuleBasedClassifier } from './rule-based.classifier';
import { SignalExtractionService } from './signal-extraction.service';

/**
 * The classification stage (`ARCHITECTURE.md` §4.3, §6.4).
 *
 * M8.1 opened the phase with experience extraction, M8.2 added the signal extractor
 * — the numeric and the phrase halves of stage 1's evidence — and M8.3 adds
 * `RuleBasedClassifier`, which drives both and applies §6.4's precedence to what
 * they find. M8.4 adds `JobClassificationService`, which stores what the classifier
 * decided, and M8.5 scores it.
 *
 * The two extractors stay exported alongside the classifier because the corpus work
 * of M8.6 exercises the stages separately, so the seams are part of the module's
 * surface rather than internals of the classifier.
 *
 * M8.5 binds `JUNIOR_SCORER`, the token M8.4 left open. `JobClassification.score`
 * is NOT NULL, and rather than keep a band table here as well — the exact way a
 * scorer and its store come to disagree — persistence takes the number through this
 * one provider, which is `ScoringService.score` and nothing else.
 *
 * `ScoringModule` is the module's only dependency on another pipeline module, and
 * per §4.3 it is the only one allowed: `classification → scoring`, never `sources/`
 * and never the other stages.
 *
 * `IngestionModule` imports the finished module at M5.4, which is deliberately
 * sequenced after this phase so that there is a real stage to wire in rather than a
 * stub. Until then, like `NormalizationModule` and `DeduplicationModule`, nothing
 * imports this one.
 */
@Module({
  // `PrismaModule` is `@Global()`, so the application does not need this line — but
  // the specs in this folder compile `ClassificationModule` on its own, where a
  // global registered by `AppModule` does not exist. Naming the dependency is what
  // keeps the module resolvable in isolation.
  imports: [PrismaModule, ScoringModule],
  providers: [
    ExperienceExtractionService,
    SignalExtractionService,
    RuleBasedClassifier,
    JobClassificationService,
    {
      // A function rather than the service itself, because that is what
      // `JobClassificationService` injects: §6.5's mapping is pure, so the seam it
      // depends on is a pure function and a test can pass one without a container.
      provide: JUNIOR_SCORER,
      inject: [ScoringService],
      useFactory:
        (scoring: ScoringService): JuniorScorer =>
        (result) =>
          scoring.score(result),
    },
  ],
  exports: [
    ExperienceExtractionService,
    SignalExtractionService,
    RuleBasedClassifier,
    JobClassificationService,
  ],
})
export class ClassificationModule {}
