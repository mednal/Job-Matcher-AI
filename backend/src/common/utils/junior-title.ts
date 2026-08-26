/**
 * Title words that hint at who a posting is for.
 *
 * This lives in `common/utils/` rather than in `classification/` because two
 * modules now need it and `jobs/` may not import the pipeline — the same reason
 * `ascii-fold.ts` moved here for M7.2 and `text-search-configuration.ts` for
 * M9.1. `level-rules.ts` still owns *what it means*: there the patterns are only
 * ever a tie-break, and moving the constant does not change a single verdict.
 *
 * The second reader is `JobSummaryResponse` (M11.10), which asks the narrower
 * question the product exists to answer: does this title say junior while the
 * posting's own stated minimum says otherwise?
 *
 * `intern` is bounded on both sides so it cannot match "internal" or
 * "international"; the German entries take a trailing tail so one entry covers
 * `Werkstudent`, `Werkstudentin` and `Berufseinsteiger:innen`.
 */
export const JUNIOR_TITLE_PATTERN =
  /\b(junior|jr\.?|graduate|trainee|intern|internship|apprentice|entry[\s-]?level|einsteiger\w*|berufseinsteiger\w*|absolvent\w*|praktikant\w*|praktikum|werkstudent\w*|azubi\w*|auszubildende\w*)\b/i;

/**
 * The other half. `lead` is a whole word only — "lead" in a title is a role, and
 * sentences, where it would more often be a verb, are not read here.
 */
export const SENIOR_TITLE_PATTERN =
  /\b(senior|sr\.?|lead|leiter\w*|teamleiter\w*|teamlead\w*|principal|staff|head|chief|manager|architect|expert\w*|director|vp)\b/i;

/**
 * The floor at which a posting has stated itself onto the experienced side.
 *
 * `CLAUDE.md`'s negative list starts at "3+ years"; so does this. It sits here
 * with the patterns for the same reason they do — `level-rules.ts` decides the
 * level with it and `JobSummaryResponse` describes the contradiction with it,
 * and the two must not be able to draw the line at different numbers.
 */
export const EXPERIENCED_FLOOR_YEARS = 3;
