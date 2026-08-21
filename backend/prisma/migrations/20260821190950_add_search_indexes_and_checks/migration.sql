-- M2.6 — the raw SQL of docs/DATABASE.md §5 that Prisma's schema language cannot
-- express, plus the §7 index entries that depend on it. Hand-edited after
-- `prisma migrate dev --create-only`: Prisma generated only a plain
-- `ADD COLUMN "searchVector" tsvector`, which is replaced below by the generated
-- column. §5's `JobClassification_one_current_idx` is deliberately NOT repeated
-- here — M2.5's migration created it and keeps ownership.

-- Trigram matching for dedup tier 3 fuzzy title comparison (§7).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Language-aware full-text search vector (D3, §5.1).
-- The CASE expression is required, not stylistic: to_tsvector(text) is only
-- STABLE, and casting a column to regconfig is not IMMUTABLE, so neither may
-- appear in a generated column. A CASE over regconfig literals is IMMUTABLE.
-- Weights: title A, companyName B, description C.
ALTER TABLE "Job" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector(CASE WHEN "language" = 'de' THEN 'german'::regconfig
                               ELSE 'english'::regconfig END, coalesce("title", '')), 'A') ||
    setweight(to_tsvector(CASE WHEN "language" = 'de' THEN 'german'::regconfig
                               ELSE 'english'::regconfig END, coalesce("companyName", '')), 'B') ||
    setweight(to_tsvector(CASE WHEN "language" = 'de' THEN 'german'::regconfig
                               ELSE 'english'::regconfig END, coalesce("description", '')), 'C')
  ) STORED;

-- §7: `q` text search with weighted rank.
CREATE INDEX "Job_searchVector_idx"  ON "Job" USING GIN ("searchVector");

-- §7: `technologies[]` containment filter.
CREATE INDEX "Job_technologies_idx"  ON "Job" USING GIN ("technologies");

-- §7: dedup tier 3 fuzzy title match, after the (companySlug, normalizedTitle)
-- btree from M2.4 narrows the candidate set.
CREATE INDEX "Job_normalizedTitle_trgm_idx"
  ON "Job" USING GIN ("normalizedTitle" gin_trgm_ops);

-- The default search set excludes merged, inactive and clearly-experienced rows,
-- so keep them out of the hot index entirely. §7: default /jobs/search.
CREATE INDEX "Job_active_search_idx"
  ON "Job" ("juniorScore" DESC, "effectivePostedAt" DESC)
  WHERE "mergedIntoJobId" IS NULL AND "isActive";

-- Domain constraints. Prisma has no CHECK support.
-- juniorScore and score are 0–100 *suitability* scores (§4.2); the range is
-- enforced here so no classifier version can write a value outside it.
ALTER TABLE "Job" ADD CONSTRAINT "Job_juniorScore_range"
  CHECK ("juniorScore" IS NULL OR ("juniorScore" BETWEEN 0 AND 100));
ALTER TABLE "JobClassification" ADD CONSTRAINT "JobClassification_score_range"
  CHECK ("score" BETWEEN 0 AND 100);
ALTER TABLE "JobClassification" ADD CONSTRAINT "JobClassification_years_order"
  CHECK ("minYears" IS NULL OR "maxYears" IS NULL OR "minYears" <= "maxYears");
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_years_range"
  CHECK ("yearsOfExperience" BETWEEN 0 AND 60);
