import { Injectable } from '@nestjs/common';
import {
  detectLanguage,
  textSearchConfiguration,
  type LanguageDetectionInput,
  type SupportedLanguage,
} from './language';

/**
 * The language stage of normalization (M6.4, `ARCHITECTURE.md` §6.2).
 *
 * Its own service rather than a method on `TextNormalizationService`, because the
 * two do different jobs: that one transforms text, this one decides a stored value
 * that the search index and the Phase 8 classifier both branch on. As with the other
 * stages the work is pure and lives in `language.ts`, so it is unit-testable with no
 * database; this class is the injectable seam the orchestrator (M5.4) depends on.
 */
@Injectable()
export class LanguageDetectionService {
  /**
   * The ISO 639-1 code for `Job.language` / `JobPosting.language`. Always `en` or
   * `de` — there is no "unknown", because every row is stemmed by one text-search
   * configuration or the other.
   */
  detect(input: LanguageDetectionInput): SupportedLanguage {
    return detectLanguage(input);
  }

  /**
   * The PostgreSQL text-search configuration a stored `language` was indexed with.
   * The search query side (M9.1) must build its `tsquery` with this, or it will not
   * match the vector it is querying.
   */
  searchConfiguration(language: string): 'english' | 'german' {
    return textSearchConfiguration(language);
  }
}
