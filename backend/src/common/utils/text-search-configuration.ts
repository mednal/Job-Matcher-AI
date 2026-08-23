import { Prisma } from '@prisma/client';

/**
 * The PostgreSQL text-search configuration a `language` value is stemmed with
 * (`DATABASE.md` §5.1, D3).
 *
 * Lives in `common/utils` rather than in `normalization` for the same reason
 * `ascii-fold.ts` does: two modules on opposite sides of `ARCHITECTURE.md` §4.3's
 * dependency graph need it and may not import each other. `normalization` (M6.4)
 * decides the `language` a row is stored with, and `search` (M9.1) has to build
 * its `tsquery` with the configuration that same value selected — while the read
 * side is forbidden from touching the pipeline. A second copy of this rule would
 * be exactly the silent drift it exists to prevent.
 *
 * It mirrors the `CASE` expression inside the `Job.searchVector` generated
 * column, and it has to: a query built with `english` against a vector built with
 * `german` matches almost nothing, and the mismatch does not raise — it just
 * returns fewer jobs. `text-search-configuration.spec.ts` reads the migration and
 * fails if the two ever diverge.
 */
export function textSearchConfiguration(
  language: string,
): 'english' | 'german' {
  // The argument is a plain string because it arrives from the database column,
  // which is `char(2)` and carries no narrower type.
  return language.trim().toLowerCase() === 'de' ? 'german' : 'english';
}

/**
 * The same mapping as a SQL fragment, for the query side.
 *
 * It is a `CASE` evaluated per row rather than a parameter chosen in TypeScript
 * because one result set spans both languages: a German and an English posting
 * matched by the same request each need their own configuration, and only the
 * database knows which row is which before the query runs.
 */
export const TEXT_SEARCH_CONFIGURATION_SQL = Prisma.sql`CASE WHEN "Job"."language" = 'de' THEN 'german'::regconfig ELSE 'english'::regconfig END`;
