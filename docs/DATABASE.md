# JuniorJob AI — Database Design

Status: approved
Scope: MVP only (see `docs/PRODUCT.md` §9 for MVP boundaries)
Engine: PostgreSQL
ORM: Prisma

## How to read this document

This document is the **authoritative description of the MVP data model**. It
supersedes the schema sketch that previously appeared in `docs/ARCHITECTURE.md`
§5.2; that section now points here.

`docs/ARCHITECTURE.md` remains authoritative for everything else — module
boundaries, the direction of dependencies, the ingestion pipeline stages, the API
surface, and the source-acquisition policy. Where this document describes a
behaviour (retention sweeps, dedup tiers, classification stages), it describes the
*storage consequences* of a decision made there, not a new decision.

Two things this document is not:

1. **Not a migration plan.** No Prisma schema file, migration, or client code is
   created by this document. Implementation happens in a separate, explicitly
   requested task.
2. **Not licence to build ahead.** Per `CLAUDE.md`, only what a task asks for gets
   built. Tables described here are the target shape; each is created when the
   feature that needs it is implemented.

---

## 1. Approved Decisions

These were reviewed and approved. They are binding on implementation.

| # | Decision | Resolution |
| - | -------- | ---------- |
| D1 | `Job.dedupHash` uniqueness | **UNIQUE.** Database-level guarantee that two canonical jobs cannot exist for the same vacancy. Ingestion must treat the constraint violation as a race to retry, not as an error. |
| D2 | `Job.mergedIntoJobId` | **Included in the MVP.** Dedup is deliberately biased toward false splits, so merges are expected; a redirect tombstone keeps `SavedJob` rows valid. |
| D3 | Languages | **English and German from day one.** Drives a `language` column and a language-aware full-text search configuration (§5). |
| D4 | Authorization | **`User.role` with `USER` and `ADMIN`.** Guards the admin-only ingestion trigger. **No admin dashboard is built in the MVP** — the role exists to guard an existing endpoint, nothing more. |
| D5 | `technologies` storage | **PostgreSQL `String[]`** with a GIN index. No `Technology` table in the MVP. |
| D6 | Primary keys | **UUID** on every table. |
| D7 | Salary | **Structured salary fields on `Job` and `JobPosting`**: `salaryMin`, `salaryMax`, `salaryCurrency`, `salaryPeriod`, `salaryText`. Stored and displayed only — **salary filtering is not implemented**, and no salary index exists (§7). |
| — | `Signal` JSON | **Kept deliberately minimal** (§4.1). Not over-designed at this stage. |

Questions still open are listed in §10.

---

## 2. Entity Overview

```
  User ──1:1── Profile
   │ 1:N
   ├──── RefreshToken
   └──── SavedJob ──N:1── Job

  JobSource ──1:N── IngestionRun ──1:N── RawJobDocument
      │ 1:N                                    │
      └──────────── JobPosting ────────────────┘
                        │ N:1  (nullable until dedup runs)
                        ▼
                       Job ──1:N── JobClassification  (exactly one isCurrent)
                        │
                        └── self-FK: mergedIntoJobId
```

The three-level job model (`docs/ARCHITECTURE.md` §5.1) is unchanged and binding:

| Model            | Meaning                                           | Cardinality               |
| ---------------- | ------------------------------------------------- | ------------------------- |
| `RawJobDocument` | Immutable payload exactly as returned by a source  | 1 per changed fetch       |
| `JobPosting`     | Normalized listing from one source                 | 1 per source listing      |
| `Job`            | Canonical vacancy shown to users                   | 1 per vacancy, N postings |

Users read `Job` and its current `JobClassification`. They never read `JobPosting`
directly, except for the source URLs shown on the job detail page.

---

## 3. Schema

Prisma schema definition language. Reproduced here as the design of record; the
actual `prisma/schema.prisma` file is written during implementation.

### 3.1 Users and authentication

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique              // stored lowercased + trimmed
  passwordHash String
  role         UserRole @default(USER)
  createdAt    DateTime @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime @updatedAt      @db.Timestamptz(3)

  profile       Profile?
  savedJobs     SavedJob[]
  refreshTokens RefreshToken[]
}

model Profile {
  id                String          @id @default(uuid())
  userId            String          @unique
  displayName       String?
  yearsOfExperience Int             @default(0)   // 0–2 for the target user
  desiredRoles      String[]                      // e.g. ["Java Developer"]
  technologies      String[]                      // canonical slugs — §6
  locations         String[]                      // free text
  countryCodes      String[]                      // ISO-3166 alpha-2
  workplaceTypes    WorkplaceType[]
  updatedAt         DateTime        @updatedAt @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model RefreshToken {
  id        String    @id @default(uuid())
  userId    String
  tokenHash String    @unique                     // sha256 of the opaque token
  expiresAt DateTime  @db.Timestamptz(3)
  revokedAt DateTime? @db.Timestamptz(3)
  createdAt DateTime  @default(now()) @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, revokedAt])
  @@index([expiresAt])
}
```

`User.role` (D4) exists to guard the admin-only manual ingestion trigger
(`docs/ARCHITECTURE.md` §6). It is checked by a guard on that route. No
administrative UI, no user-management endpoints, and no further roles are part of
the MVP.

The raw refresh token is never stored — only its hash, so a database disclosure
does not yield usable tokens. Rotation and revocation semantics are described in
`docs/ARCHITECTURE.md` §9.

### 3.2 Sources and ingestion

```prisma
model JobSource {
  id              String       @id @default(uuid())
  key             String       @unique          // "example-source"
  displayName     String
  accessMethod    AccessMethod                  // compliance record, ARCH §7.1
  termsUrl        String?
  attributionText String?                       // rendered by the UI when set
  enabled         Boolean      @default(true)
  createdAt       DateTime     @default(now()) @db.Timestamptz(3)

  postings      JobPosting[]
  ingestionRuns IngestionRun[]
  rawDocuments  RawJobDocument[]
}

model IngestionRun {
  id           String           @id @default(uuid())
  sourceId     String
  trigger      IngestionTrigger @default(SCHEDULED)
  status       IngestionStatus
  startedAt    DateTime         @default(now()) @db.Timestamptz(3)
  finishedAt   DateTime?        @db.Timestamptz(3)
  fetched      Int              @default(0)
  created      Int              @default(0)
  updated      Int              @default(0)
  unchanged    Int              @default(0)
  duplicates   Int              @default(0)
  failed       Int              @default(0)
  errorMessage String?

  source       JobSource        @relation(fields: [sourceId], references: [id])
  rawDocuments RawJobDocument[]

  @@index([sourceId, startedAt(sort: Desc)])
  @@index([status, startedAt])                  // find runs stuck in RUNNING
}

model RawJobDocument {
  id             String   @id @default(uuid())
  sourceId       String
  ingestionRunId String?
  externalId     String
  contentHash    String                         // sha256 of canonicalized payload
  payload        Json
  fetchedAt      DateTime @default(now()) @db.Timestamptz(3)

  source       JobSource     @relation(fields: [sourceId], references: [id])
  ingestionRun IngestionRun? @relation(fields: [ingestionRunId], references: [id], onDelete: SetNull)

  @@unique([sourceId, externalId, contentHash])  // unchanged re-fetch ≠ new row
  @@index([sourceId, externalId, fetchedAt(sort: Desc)])
  @@index([fetchedAt])                           // 90-day retention sweep
}
```

`JobSource.accessMethod`, `termsUrl` and `attributionText` record how a source may
be used, per `docs/ARCHITECTURE.md` §7. Storing them makes compliance auditable and
lets the UI render required attribution without hard-coding it per source.

`RawJobDocument.contentHash` is the change-detection key. Re-fetching an unchanged
listing writes no row, which keeps storage proportional to *changes* rather than to
*fetches* — this is what makes the 90-day retention policy affordable.

### 3.3 Job postings and canonical jobs

```prisma
model JobPosting {
  id             String          @id @default(uuid())
  sourceId       String
  externalId     String                         // id within that source
  jobId          String?                        // canonical cluster; null until dedup
  url            String
  title          String
  companyName    String
  companySlug    String
  location       String?
  countryCode    String?         @db.Char(2)
  workplaceType  WorkplaceType?
  employmentType EmploymentType?
  language       String          @default("en") @db.Char(2)   // ISO 639-1 — §5.1
  description    String          @db.Text       // normalized plain text
  contentHash    String                         // skip re-classify when unchanged
  technologies   String[]

  salaryMin      Decimal?        @db.Decimal(12, 2)
  salaryMax      Decimal?        @db.Decimal(12, 2)
  salaryCurrency String?         @db.Char(3)    // ISO 4217
  salaryPeriod   SalaryPeriod?
  salaryText     String?                        // verbatim excerpt from the posting

  postedAt       DateTime?       @db.Timestamptz(3)
  firstSeenAt    DateTime        @default(now()) @db.Timestamptz(3)
  lastSeenAt     DateTime        @default(now()) @db.Timestamptz(3)
  isActive       Boolean         @default(true)

  source JobSource @relation(fields: [sourceId], references: [id])
  job    Job?      @relation(fields: [jobId], references: [id], onDelete: SetNull)

  @@unique([sourceId, externalId])              // idempotent re-ingestion
  @@index([jobId])
  @@index([companySlug])                        // dedup tier-3 candidate lookup
  @@index([sourceId, lastSeenAt])               // staleness sweep
}

model Job {
  id              String          @id @default(uuid())
  title           String
  normalizedTitle String                        // dedup tier-3 input, trigram-indexed
  companyName     String
  companySlug     String                        // dedup partition key + filtering
  location        String?
  countryCode     String?         @db.Char(2)
  workplaceType   WorkplaceType?
  employmentType  EmploymentType?
  language        String          @default("en") @db.Char(2)
  description     String          @db.Text
  technologies    String[]
  dedupHash       String          @unique       // D1 — exact-match clustering key
  mergedIntoJobId String?                       // D2 — redirect after a merge

  salaryMin      Decimal?         @db.Decimal(12, 2)
  salaryMax      Decimal?         @db.Decimal(12, 2)
  salaryCurrency String?          @db.Char(3)
  salaryPeriod   SalaryPeriod?
  salaryText     String?

  postedAt          DateTime?     @db.Timestamptz(3)
  effectivePostedAt DateTime      @db.Timestamptz(3)   // coalesce(postedAt, firstSeenAt)
  firstSeenAt       DateTime      @default(now()) @db.Timestamptz(3)
  lastSeenAt        DateTime      @default(now()) @db.Timestamptz(3)
  isActive          Boolean       @default(true)

  // Denormalized from the current classification: filter and sort without a join.
  juniorLevel      JuniorLevel?
  juniorScore      Int?                          // 0–100 suitability, CHECK enforced
  requiredMinYears Int?
  requiredMaxYears Int?
  classifiedAt     DateTime?      @db.Timestamptz(3)

  // searchVector tsvector — generated column, added via raw SQL (§5)

  mergedInto      Job?                @relation("JobMerge", fields: [mergedIntoJobId], references: [id])
  mergedFrom      Job[]               @relation("JobMerge")
  postings        JobPosting[]
  classifications JobClassification[]
  savedBy         SavedJob[]

  @@index([juniorLevel, effectivePostedAt(sort: Desc)])
  @@index([juniorScore(sort: Desc), effectivePostedAt(sort: Desc)])
  @@index([countryCode, workplaceType])
  @@index([companySlug, normalizedTitle])
  @@index([lastSeenAt])
}
```

Notes on specific fields:

- **`lastSeenAt` is set explicitly by ingestion, not by `@updatedAt`.** A
  classification refresh writes to the row; if `lastSeenAt` were `@updatedAt`, a job
  nobody has seen in months would look freshly observed and would never age out
  under the retention rule (§8).
- **`normalizedTitle` is persisted**, not merely hashed into `dedupHash`, because
  dedup tier 3 runs trigram similarity against it (`docs/ARCHITECTURE.md` §6.3).
- **`requiredMinYears` / `requiredMaxYears` are denormalized** from the current
  classification so the `maxYearsRequired` search parameter
  (`docs/ARCHITECTURE.md` §8.1) does not force a join on every search.
- **`effectivePostedAt` is non-null** so sorting and pagination are stable;
  `postedAt` stays nullable because not every source publishes one.
- **`mergedIntoJobId`** (D2): when two `Job` rows turn out to be the same vacancy,
  the loser keeps its id, gains a redirect, and is excluded from search by
  `mergedIntoJobId IS NULL`. Saved jobs pointing at it stay valid and resolve
  through the redirect.

### 3.4 Salary (D7)

Salary is captured in five fields on both `JobPosting` and `Job`:

| Field | Meaning |
| ----- | ------- |
| `salaryMin` | Lower bound, `Decimal(12,2)` — handles hourly rates as well as annual figures |
| `salaryMax` | Upper bound; equal to `salaryMin` when a single figure is stated |
| `salaryCurrency` | ISO 4217 alpha-3, uppercase |
| `salaryPeriod` | `HOURLY`, `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY` |
| `salaryText` | The verbatim excerpt the values were parsed from |

All five are nullable. Most postings state no salary, and partial extraction is
normal — a `salaryText` with no parsed bounds is a valid state.

`salaryText` exists for the same reason classification evidence does: a parsed
number that cannot be traced back to its source text cannot be debugged, and should
not be displayed as fact.

**Salary filtering is not implemented in the MVP.** These fields are populated by
normalization and displayed on the job detail view. There is deliberately **no index
on any salary column** — an unused index is write cost with no read benefit. The
search parameters in `docs/ARCHITECTURE.md` §8.1 are unchanged.

Comparing salaries across currencies and periods requires normalization to a common
basis, which requires exchange rates and assumptions about hours per year. That is
out of MVP scope, and it is why filtering is deferred rather than the fields being
omitted: capturing the data now costs one migration, whereas backfilling it later is
impossible once raw documents expire after 90 days (§8).

### 3.5 Classification and saved jobs

```prisma
model JobClassification {
  id                String      @id @default(uuid())
  jobId             String
  classifierVersion String                      // "rules-1.0" | "llm-1.0"
  inputHash         String                      // hash of the classified text
  level             JuniorLevel
  score             Int                         // 0–100 suitability
  minYears          Int?                        // extracted requirement
  maxYears          Int?
  positiveSignals   Json                        // Signal[] — §4.1
  negativeSignals   Json                        // Signal[] — §4.1
  summary           String?                     // short human explanation
  isCurrent         Boolean     @default(true)
  createdAt         DateTime    @default(now()) @db.Timestamptz(3)

  job Job @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@unique([jobId, classifierVersion, inputHash])
  @@index([jobId, isCurrent])
  @@index([classifierVersion, createdAt])       // offline evaluation of a version
}

model SavedJob {
  id        String   @id @default(uuid())
  userId    String
  jobId     String
  note      String?
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  job  Job  @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@unique([userId, jobId])
  @@index([userId, createdAt(sort: Desc)])
}
```

`inputHash` serves two purposes at once: it is the cache key that lets an unchanged
description skip re-classification (`docs/ARCHITECTURE.md` §6.4), and it is what
allows a job whose description changed to keep both the old and the new result under
the same `classifierVersion`. Exactly one row per job carries `isCurrent`, enforced
by a partial unique index (§5).

Classification rows are never deleted. Retaining them across versions is what makes
it possible to evaluate a new classifier against past jobs before promoting it.

### 3.6 Enums

```prisma
enum UserRole         { USER ADMIN }
enum JuniorLevel      { ENTRY_LEVEL LIKELY_ENTRY_LEVEL AMBIGUOUS EXPERIENCED CLEARLY_EXPERIENCED }
enum WorkplaceType    { REMOTE ONSITE HYBRID }
enum EmploymentType   { FULL_TIME PART_TIME INTERNSHIP CONTRACT WORKING_STUDENT }
enum SalaryPeriod     { HOURLY DAILY WEEKLY MONTHLY YEARLY }
enum IngestionStatus  { RUNNING SUCCESS FAILED }
enum IngestionTrigger { SCHEDULED MANUAL }
enum AccessMethod     { PUBLIC_API PARTNER_API OFFICIAL_FEED DATA_AGREEMENT LICENSED_CONTENT }
```

`JuniorLevel` is fixed by `CLAUDE.md` and must not be extended or renamed without a
product decision.

---

## 4. Classification Evidence

### 4.1 Signal shape

`positiveSignals` and `negativeSignals` each store a JSON array of:

```ts
interface Signal {
  code: string;      // "ZERO_TO_TWO_YEARS", "REQUIRES_3_PLUS_YEARS", "TEAM_LEAD"
  weight: number;    // contribution to the score
  evidence: string;  // verbatim excerpt from the description
}
```

This shape is **deliberately minimal and is not specified further at this stage.**
Concretely:

- It is validated **in code**, at the classifier boundary, not by a database
  constraint. There is no JSON schema constraint and no generated column over the
  JSON.
- Signals are **never queried independently** — they are read as a whole alongside
  their classification row. That is why they are JSON rather than a table, and why
  no GIN index exists on these columns.
- Because they are JSON, the shape can gain fields without a migration. Additional
  structure should be added when a classifier actually needs it, not in advance.

What is *not* negotiable is that `evidence` holds a **verbatim excerpt**. It is what
makes the explanation in `PRODUCT.md` §7 possible, and what lets a bad
classification be debugged after the fact.

### 4.2 The score is a suitability score

`Job.juniorScore` and `JobClassification.score` express **how well a posting's
stated requirements match a candidate with roughly 0–2 years of experience.**

They must never be named, exposed, or described as a probability of being hired,
interviewed, or responded to. Field names such as `probability`, `chance`,
`likelihood`, `successRate` or `matchProbability` are prohibited at every layer. The
full rationale and the per-layer enforcement rules are in `docs/ARCHITECTURE.md`
§6.5.

The data model's contribution to that guarantee is the naming above, plus the fact
that the score is always stored next to the `JuniorLevel` band and the evidence that
produced it.

---

## 5. Raw SQL in Migrations

Prisma's schema language cannot express the following. These belong in the initial
migration as raw SQL (`prisma migrate dev --create-only`, then hand-edited). This
and `search/search.repository.ts` are the only places raw SQL is acceptable.

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Language-aware full-text search vector (D3).
-- The CASE expression is required, not stylistic: to_tsvector(text) is only
-- STABLE, and casting a column to regconfig is not IMMUTABLE, so neither may
-- appear in a generated column. A CASE over regconfig literals is IMMUTABLE.
ALTER TABLE "Job" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector(CASE WHEN "language" = 'de' THEN 'german'::regconfig
                               ELSE 'english'::regconfig END, coalesce("title", '')), 'A') ||
    setweight(to_tsvector(CASE WHEN "language" = 'de' THEN 'german'::regconfig
                               ELSE 'english'::regconfig END, coalesce("companyName", '')), 'B') ||
    setweight(to_tsvector(CASE WHEN "language" = 'de' THEN 'german'::regconfig
                               ELSE 'english'::regconfig END, coalesce("description", '')), 'C')
  ) STORED;

CREATE INDEX "Job_searchVector_idx"  ON "Job" USING GIN ("searchVector");
CREATE INDEX "Job_technologies_idx"  ON "Job" USING GIN ("technologies");
CREATE INDEX "Job_normalizedTitle_trgm_idx"
  ON "Job" USING GIN ("normalizedTitle" gin_trgm_ops);

-- Exactly one current classification per job. Prisma has no partial unique index.
CREATE UNIQUE INDEX "JobClassification_one_current_idx"
  ON "JobClassification" ("jobId") WHERE "isCurrent";

-- The default search set excludes merged, inactive and clearly-experienced rows,
-- so keep them out of the hot index entirely.
CREATE INDEX "Job_active_search_idx"
  ON "Job" ("juniorScore" DESC, "effectivePostedAt" DESC)
  WHERE "mergedIntoJobId" IS NULL AND "isActive";

-- Domain constraints. Prisma has no CHECK support.
ALTER TABLE "Job" ADD CONSTRAINT "Job_juniorScore_range"
  CHECK ("juniorScore" IS NULL OR ("juniorScore" BETWEEN 0 AND 100));
ALTER TABLE "Job" ADD CONSTRAINT "Job_salary_order"
  CHECK ("salaryMin" IS NULL OR "salaryMax" IS NULL OR "salaryMin" <= "salaryMax");
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_salary_order"
  CHECK ("salaryMin" IS NULL OR "salaryMax" IS NULL OR "salaryMin" <= "salaryMax");
ALTER TABLE "JobClassification" ADD CONSTRAINT "JobClassification_score_range"
  CHECK ("score" BETWEEN 0 AND 100);
ALTER TABLE "JobClassification" ADD CONSTRAINT "JobClassification_years_order"
  CHECK ("minYears" IS NULL OR "maxYears" IS NULL OR "minYears" <= "maxYears");
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_years_range"
  CHECK ("yearsOfExperience" BETWEEN 0 AND 60);
```

The `searchVector` column is declared `Unsupported("tsvector")?` in the Prisma schema
and queried with `$queryRaw`.

**The query side must select the same configuration as the write side.** A search
against a German posting must use `websearch_to_tsquery('german', $q)`; using the
English configuration silently drops results through stemming mismatches rather than
failing loudly. Both sides derive the configuration from the same `language` value.

### 5.1 Language support (D3)

`language` holds an ISO 639-1 code, is non-null, and defaults to `'en'`. It is set
during normalization by language detection.

- Supported search configurations: `de` maps to `german`, everything else maps to
  `english`.
- A detected language outside `{en, de}` is stored as detected and falls back to the
  English configuration for indexing. This is a deliberate degradation rather than a
  rejection: the posting stays searchable, just without correct stemming.
- Adding a third configuration means altering the generated column, which rewrites
  the table. That is the cost D3 accepts in exchange for correct German stemming
  from day one.

The rule-based classifier carries German patterns from day one for the same reason
(`docs/ARCHITECTURE.md` §6.4).

---

## 6. Canonical Vocabularies

These string values are compared across tables and must therefore be canonicalized
at **write** time. Normalizing at read time would mean a full scan per query, and
comparing un-normalized values silently matches nothing.

| Value | Rule | Used for |
| ----- | ---- | -------- |
| `technologies[]` | Lowercase dictionary slugs: `java`, `spring-boot`, `postgresql`. Display labels live in the code-side skill dictionary, not the database. | Search filtering, profile-fit ranking |
| `companySlug` | Lowercased, legal suffixes stripped (GmbH, Ltd, Inc, AG, BV, SAS…), punctuation removed | Dedup partition key, company filtering |
| `normalizedTitle` | Lowercased, seniority words, `(m/f/d)`-style markers and punctuation removed | Dedup tiers 2 and 3 |
| `countryCode` | ISO-3166 alpha-2, uppercase, `CHAR(2)` | Location filtering |
| `email` | Lowercased and trimmed before write | Case-insensitive uniqueness without the `citext` extension |

`companySlug` and `normalizedTitle` are inputs to `dedupHash`, so their rules are
versioned together with the deduplication logic. **Changing either rule invalidates
every stored `dedupHash`** and requires a recompute migration. This is the main
reason `RawJobDocument` is retained (§8): the recompute runs from stored payloads
rather than by re-fetching from sources.

---

## 7. Index Inventory

Every index, and the query that justifies it. An index without a query on this list
should not be created.

| Index | Query it serves |
| ----- | --------------- |
| `Job_active_search_idx` (partial) | Default `/jobs/search`, sorted by junior score |
| `Job(juniorLevel, effectivePostedAt DESC)` | `juniorLevel[]` filter with recency sort |
| `Job(juniorScore DESC, effectivePostedAt DESC)` | `minJuniorScore` filter, `juniorScore` sort |
| `Job(countryCode, workplaceType)` | Location and workplace facet filtering |
| `Job.searchVector` GIN | `q` text search with weighted rank |
| `Job.technologies` GIN | `technologies[]` containment filter |
| `Job.normalizedTitle` GIN trigram | Dedup tier 3 fuzzy title match |
| `Job(companySlug, normalizedTitle)` | Dedup tier 3 candidate narrowing before trigram |
| `Job.dedupHash` UNIQUE | Dedup tier 2 exact lookup (D1) |
| `Job.lastSeenAt` | Staleness sweep |
| `JobPosting(sourceId, externalId)` UNIQUE | Dedup tier 1, idempotent upsert |
| `JobPosting.jobId` | Job detail — "also listed on N sources" |
| `JobPosting.companySlug` | Dedup tier 3 candidate lookup |
| `JobPosting(sourceId, lastSeenAt)` | Per-source staleness sweep |
| `JobClassification_one_current_idx` (partial unique) | Enforces one current row; serves the detail fetch |
| `JobClassification(jobId, isCurrent)` | Job detail evidence fetch |
| `JobClassification(classifierVersion, createdAt)` | Offline evaluation of a new classifier version |
| `SavedJob(userId, jobId)` UNIQUE | Idempotent save, duplicate prevention |
| `SavedJob(userId, createdAt DESC)` | `/saved-jobs` listing |
| `RefreshToken.tokenHash` UNIQUE | Refresh rotation lookup |
| `RefreshToken(userId, revokedAt)` | Revoke-all-for-user on logout |
| `RefreshToken.expiresAt` | Expired-token cleanup |
| `RawJobDocument(sourceId, externalId, contentHash)` UNIQUE | Change detection on re-fetch |
| `RawJobDocument(sourceId, externalId, fetchedAt DESC)` | Replay the latest payload for re-normalization |
| `RawJobDocument.fetchedAt` | 90-day retention delete |

Deliberately **not** indexed: all salary columns (D7 — no filtering in the MVP),
`Profile` scalar arrays (read only for the owning user), and the `Signal` JSON
columns (§4.1).

Pagination is offset-based with `pageSize ≤ 50` (`docs/ARCHITECTURE.md` §8.1). Offset
pagination degrades on deep pages; at MVP result volumes it is the right trade, and
keyset pagination is a later change confined to `search.repository.ts`.

---

## 8. Lifecycle and Retention

| Row | Rule |
| --- | ---- |
| `RawJobDocument` | Hard-deleted after 90 days by `fetchedAt`, in batches |
| `JobPosting` | `isActive = false` when not seen in consecutive successful runs of its source. Never deleted. |
| `Job` | `isActive = false` when all its postings are inactive. Excluded from search after 45 days by `lastSeenAt`. Never deleted. |
| `Job` (merged) | Retained with `mergedIntoJobId` set; excluded from search, still resolvable from `SavedJob` |
| `JobClassification` | Retained across versions — this is what makes classifier evaluation possible |
| `RefreshToken` | Deleted once expired for more than 30 days |

Only `RawJobDocument` and `RefreshToken` are hard-deleted. Everything a user can
reach is soft-deactivated, so a saved job never dangles.

Deletion behaviour on relations:

- `User` to `Profile`, `RefreshToken`, `SavedJob`: `Cascade`. Deleting a user removes
  their data.
- `Job` to `JobClassification`, `SavedJob`: `Cascade`.
- `Job` to `JobPosting`: `SetNull`. A posting outlives its cluster and can be
  re-clustered.
- `JobSource` to `JobPosting`, `RawJobDocument`, `IngestionRun`: restricted (Prisma
  default). A source with ingested data cannot be deleted; disable it with
  `enabled = false` instead.

---

## 9. Compatibility With Future SaaS Evolution

Not to be implemented during the MVP (`PRODUCT.md` §10, `docs/ARCHITECTURE.md` §13).
Recorded so today's schema does not block tomorrow's.

| Future capability | What this schema already provides |
| ----------------- | --------------------------------- |
| Job alerts, daily recommendations | `Profile` already stores the query shape; an alert is a scheduled job reusing the same search path |
| CV-to-job matching, skill-gap analysis | `Job.technologies[]` plus stored classification evidence; a `CvDocument` model attaches to `User` |
| Personalized matching | Profile-fit ranking is applied at query time, so the stored score stays user-independent and cacheable |
| Subscriptions and billing | `User` gains a `plan` field; entitlement checks fit as a guard alongside the existing role guard |
| Application tracking | An `Application` model referencing `Job`; `SavedJob` is its precursor |
| Salary filtering and comparison | Structured salary fields are already captured (D7); only currency/period normalization and an index are missing |
| Recruiter accounts, company dashboards | `User.role` already exists as the role dimension; a `Company` entity would be extracted from `companySlug` |
| Search growth | Query building is confined to `search.repository.ts`; swapping PostgreSQL FTS for a search engine touches one file |

---

## 10. Remaining Open Questions

D1–D7 are closed. These remain open and do not block the schema:

1. **Which sources ship first.** Deferred by design (`docs/ARCHITECTURE.md` §7.5).
   `JobSource.accessMethod` records the answer per source once it is made. Blocks
   live ingestion only.
2. **Fuzzy dedup threshold.** The `pg_trgm` similarity cutoff must be tuned against
   real data. The initial value is a conservative guess biased toward splitting
   rather than merging — D2 exists precisely so that bias stays correctable.
3. **AI classifier in the MVP.** Stage 2 remains optional and feature-flagged. The
   schema supports either outcome through `classifierVersion` and `inputHash`; the
   decision is a cost/quality call once rule-based accuracy is measured.
4. **Language detection library.** D3 fixes the storage and the search configuration
   but not the detection implementation. Any detector returning ISO 639-1 codes fits.
