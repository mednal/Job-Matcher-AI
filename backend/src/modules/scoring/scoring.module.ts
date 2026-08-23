import { Module } from '@nestjs/common';
import { ScoringService } from './scoring.service';

/**
 * The scoring stage (`ARCHITECTURE.md` §4.1, §4.3, §6.5).
 *
 * The one module in the pipeline that depends on nothing — no Prisma, no
 * configuration, no other module. It maps a classification result to a number and
 * that is all, which is what lets §4.3 draw the only arrow between two pipeline
 * modules straight at it: `classification → scoring`, and nothing back.
 *
 * `ClassificationModule` imports this one and binds `ScoringService` to the
 * `JUNIOR_SCORER` token M8.4 left open, so `JobClassification.score` is written by
 * this module's rules and there is no second band table anywhere.
 */
@Module({
  providers: [ScoringService],
  exports: [ScoringService],
})
export class ScoringModule {}
