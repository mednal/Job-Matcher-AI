import { Injectable } from '@nestjs/common';
import { htmlToPlainText } from './html-to-text';
import { normalizePlainText } from './text-normalization';

/**
 * The text stage of normalization (M6.1, `ARCHITECTURE.md` 6.2).
 *
 * The conversion itself is pure and lives in `html-to-text.ts` and
 * `text-normalization.ts`, so it is unit-testable with fixtures and no database, as
 * 6 requires of every pipeline stage. This class is the injectable seam the later
 * stages and the orchestrator depend on.
 */
@Injectable()
export class TextNormalizationService {
  /**
   * A source description in whatever markup it arrived in, as normalized plain
   * text. Input that is already plain text passes through the same path, so callers
   * never have to detect the format.
   */
  toPlainText(input: string | null | undefined): string {
    return htmlToPlainText(input);
  }

  /**
   * Whitespace and unicode normalization alone, for values that are never markup:
   * titles, company names, locations. Kept separate from `toPlainText` because a
   * title must not acquire line structure.
   */
  normalize(input: string | null | undefined): string {
    return input ? normalizePlainText(input) : '';
  }
}
