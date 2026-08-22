# JuniorJob AI — Development Milestones

Status: living document
Scope: MVP roadmap (Part I) + recorded post-MVP direction (Part II)
Sources: `CLAUDE.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`,
`docs/SOURCES.md`

## How to read this document

This is the **execution roadmap**. `ARCHITECTURE.md` says what the system should
look like; `DATABASE.md` says what the data model is; this document says **in what
order the work happens and how each step is proven done**.

Rules that govern it:

- A milestone is **small and independently verifiable**. Every one carries a
  `Verify:` line — the command, test, or observable behaviour that closes it. If it
  cannot be verified without also finishing the next milestone, it is too big.
- A milestone is checked `[x]` **only when the work exists in the repository** and
  its `Verify:` line passes. Design documents describing a thing do not check it.
- Per `CLAUDE.md`, this document is **not standing authorization**. Each milestone is
  implemented when it is explicitly requested as a task. Listing work here does not
  start it.
- **Part II is not MVP work.** Nothing in it is implemented during the MVP.

Legend:

- [ ] not completed
- [x] completed and verified in the repository

---

## Current status snapshot

As of the last update to this file:

| Area | State |
| ---- | ----- |
| Product / architecture / database design | Written (`PRODUCT.md`, `ARCHITECTURE.md`, `DATABASE.md`). D1–D7 closed; D7 **revised 2026-08-21** to exclude salary, company entities, job taxonomy, and application tracking from the MVP schema (`DATABASE.md` §3.4) |
| Source adapter architecture | Designed and approved 2026-08-21 (`ARCHITECTURE.md` §6.1, Phase 5 decisions A1–A7). **M5.1–M5.3 implemented 2026-08-22**: `modules/sources/` holds the `JobSourceAdapter` contract, the `SOURCE_ADAPTERS` token, `SourceRegistryService` (descriptors validated at construction, so an invalid or duplicated one aborts boot), the `PaginatedSourceAdapter` base that owns pagination, the `SourceError` hierarchy, the shared `SourceHttpClient` (truthful User-Agent, per-source rate limiting, 5xx/network-only retries, 401/403/429 and block pages as stop conditions), the `describeAdapterContract` conformance suite, and `FixtureSourceAdapter`; `modules/ingestion/` holds M5.3's raw stage — content-hashed `RawJobDocument` writes, canonicalization with `volatilePayloadPaths`, `IngestionRun` bookkeeping, the `RUNNING` guard and the stale-run reaper. `sources.imports.spec.ts` enforces the §4.2 and §7.3 boundaries mechanically. **M5.4 is no longer blocked by a decision** — §14.5 was resolved 2026-08-22 (curated per-source ingestion plan) — but it is now deliberately sequenced after Phases 6–8, so that the stages it orchestrates exist before it wires them; M5.5–M5.6 follow it. `docs/SOURCES.md` still records **no reviewed sources** — the fixture adapter is not one, and the register now says so explicitly |
| Angular workspace | Scaffolded only — default welcome page, no routes, no app code |
| NestJS backend | Config, validation pipe, CORS, `/api/v1/health` (now `@Public()`), plus a working `AuthModule` and `UsersModule`: register, login, argon2id hashing, JWT access tokens, refresh-token rotation/revocation, logout, a global `JwtAuthGuard`, and `GET /users/me`. M3.5/M3.6 close Phase 3: a second global `RolesGuard` with a `@Roles()` decorator (metadata opt-in, role read from the database rather than the token so a demotion takes effect immediately) and a `ProfilesModule` serving `GET`/`PUT /profiles/me` (`PUT` replaces rather than merges; a user who has never saved one gets an empty profile, not a 404; ownership is structural because no route names a profile by id). **Phase 3 is complete.** No admin route exists yet to point `RolesGuard` at — the first is M5.5's ingestion trigger — so its e2e declares a test-only `@Roles(ADMIN)` controller, keeping D4's "no admin surface" intact. M4.1/M4.2 add `JobsModule`: `GET /jobs/:id` (detail with classification evidence, every source URL and its attribution, resolving `mergedIntoJobId` through a redirect) and `GET /jobs` (the `{ items, page, pageSize, total }` envelope, `pageSize` ≤ 50, inactive and merged jobs excluded), both public, plus the shared pagination DTOs in `common/dto/`. **Phase 4 is complete** — the read side serves the seeded jobs, so Phase 11 is unblocked. |
| PostgreSQL / Prisma | Postgres 18 runs in Docker on host port 5433. `prisma/schema.prisma` now holds `User`, `Profile`, `RefreshToken`, `UserRole`, `WorkplaceType` (M2.2's slice, migration `20260821171157_add_user_auth_tables`) plus `JobSource`, `IngestionRun`, `RawJobDocument`, `AccessMethod`, `IngestionStatus`, `IngestionTrigger` (M2.3's slice, migration `20260821180642_add_source_ingestion_tables`) plus `JobPosting`, `Job` and `EmploymentType` (M2.4's slice, migration `20260821182202_add_job_tables`) plus `JobClassification`, `SavedJob`, `JuniorLevel` and `Job`'s denormalized classification block (M2.5's slice, migration `20260821184731_add_classification_saved_job_tables`, which also hand-writes the partial unique index enforcing one current classification per job). Every MVP table of `DATABASE.md` §3 now exists. M2.6's slice (migration `20260821190950_add_search_indexes_and_checks`, commit `f3cb483`) adds the raw SQL of §5: the `pg_trgm` extension, the generated `Job.searchVector` column, GIN indexes on `searchVector`, `technologies` and `normalizedTitle` (trigram), the partial `Job_active_search_idx`, and all four CHECK constraints — so §7's index inventory is 25/25 complete. The three GIN indexes are also declared in `schema.prisma` purely to stop Prisma proposing to drop them; see M2.6's fragile-point note before running `prisma migrate dev`. M2.7 closes Phase 2: `prisma/seed.ts` + `prisma/seed-data.ts`, run with `npm run db:seed`, write a demo user, a demo admin, two fixture sources and 10 fixture jobs with one classification each, idempotently. **Phase 2 is complete.** |
| Development fixtures | Seeded (M2.7). 10 jobs covering all five `JuniorLevel` bands, English and German, the adversarial "Junior title / 5+ years body" case, a two-source job, an inactive job and a merged-away job. Hand-written, not classifier output — stamped `classifierVersion = "seed-fixture-1.0"`. This is the corpus Phases 6–8 should be checked against |
| Normalization | **M6.1 implemented 2026-08-22**: `modules/normalization/` holds the text stage — `htmlToPlainText` (markup to plain text preserving paragraph and list breaks, non-prose elements dropped with their content, entities decoded last) and `normalizePlainText` (NFKC, invisible and control characters removed, whitespace and bullet markers folded, idempotent), behind an injectable `TextNormalizationService` with a three-pair fixture corpus. **M6.2 implemented 2026-08-22**: `company-slug.ts` (`toCompanySlug` — German-style ASCII folding so `Müller`/`Mueller`/`Muller` are one slug, joining punctuation deleted, trailing legal forms stripped repeatedly and only at the end, a name that is *only* a legal form kept intact), `location.ts` (`parseLocation` — free text into a display `location` plus an ISO alpha-2 `countryCode` from a curated English/German alias table, with **no city-to-country inference**, since `countryCode` feeds `dedupHash` and tier 3 covers the resulting split while nothing covers a false merge), the shared `ascii-fold.ts`, and `CompanyLocationService` — pinned by spec against both the fixture payloads and the seeded slugs. **M6.3 implemented 2026-08-22**: `phrase-match.ts` (ASCII-folded, token-aligned phrase matching with a three-token negation window), `workplace-type.ts` (REMOTE/HYBRID/ONSITE in English and German, title and location consulted before the description, remote-plus-onsite evidence resolving to HYBRID), `employment-type.ts` (the five-member enum, narrower arrangement winning so a Werkstudent posting is not recorded as PART_TIME), `technologies.ts` (a curated closed dictionary with its own symbol-aware boundaries, so `c#`, `.net` and `node.js` survive matching that `java` inside `javascript` does not), and `JobAttributesService`. Both detectors accept a `declared` value the adapter layer has already mapped to the enum, which wins over the text; `null` stays a real answer for both columns. `NormalizationModule` is not imported by `AppModule` yet: `IngestionModule` takes it at M5.4. M6.4 is not started |
| Ingestion configuration | `SOURCE_USER_AGENT_CONTACT` added to configuration, the Joi schema and `.env.example` (§7.3.2). `INGESTION_ENABLED` and `INGESTION_CRON` belong to M5.5 and are deliberately not added yet |
| Everything else | Not started |

Two working-tree notes: `docs/DATABASE.md` is untracked and `docs/ARCHITECTURE.md`
has uncommitted modifications. Both are treated as complete here because their
content exists; commit them with M0.4.

**Critical path:** M2 (database) blocks M3 (auth) and M4 (job read model). M4 plus
M5.1 (fixtures) unblock the frontend, so Phase 11 can run in parallel with the
ingestion pipeline (Phases 5–8) rather than after it. Per `ARCHITECTURE.md` §7.5,
**no live job source is required until M12.2** — everything before it is built
against fixtures and a seeded database.

---

# Part I — MVP

## Phase 0 — Project Foundation

Goal: the repository, its documentation, and its toolchain are in place.

### M0.1 — Repository and product definition
- [x] Git repository initialized on `main`
- [x] `CLAUDE.md` committed with product, architecture, and coding rules
- [x] `docs/PRODUCT.md` — vision, target user, core UX, MVP boundaries
- Verify: files present at repo root and in `docs/`, committed.

### M0.2 — Architecture design
- [x] `docs/ARCHITECTURE.md` — module boundaries, pipeline, API surface, auth model
- [x] Source acquisition and compliance policy (§7) recorded as binding
- [x] Testing strategy decided (Jest backend / Vitest frontend)
- Verify: `docs/ARCHITECTURE.md` covers §1–§14; no unresolved structural decision.

### M0.3 — Database design
- [x] `docs/DATABASE.md` — full Prisma schema of record, indexes, retention, raw SQL
- [x] Decisions D1–D7 resolved and marked approved
- Verify: every model in `ARCHITECTURE.md` §5.1 has a schema definition in §3.

### M0.4 — Repository hygiene
- [ ] Commit `docs/DATABASE.md` and the pending `docs/ARCHITECTURE.md` edits
- [ ] Root `README.md` — what the project is, how to run backend + frontend
- [ ] Root `.gitignore` covering both projects' build output
- [ ] Confirm `backend/dist/` and `node_modules/` are not tracked
- Verify: `git status` clean; `git ls-files` matches nothing under `dist/` or `node_modules/`.

### M0.5 — Local development environment
- [x] `docker-compose.yml` running PostgreSQL 18 with a named volume
      (`juniorjob_postgres_data`, mounted at `/var/lib/postgresql`)
- [x] Postgres exposed on a documented port; credentials from `.env`
      (host `5433` -> container `5432`; `5432` on this machine belongs to an
      unrelated native PostgreSQL installation and is left untouched)
- [x] `pg_trgm` extension available in the container image
      (`pg_available_extensions` reports 1.6; not yet created — that belongs to
      the first Prisma migration in M2.1)
- [ ] README section: start the database, run migrations, seed, run both apps
- Verify: `docker compose up -d`, then a `psql` connection runs `SELECT 1` successfully.
- Verified 2026-08-21: container `juniorjob-postgres` healthy on PostgreSQL 18.6;
  `psql -h localhost -p 5433 -U juniorjob -d juniorjob` runs `SELECT 1`; database
  `juniorjob` present in `pg_database`; a wrong password is rejected. Prisma is
  not wired up yet, so `DATABASE_URL` is documented but unread by the app.

---

## Phase 1 — Backend Foundation

Goal: a NestJS application that boots, validates its configuration, and answers a
health check.

### M1.1 — NestJS application skeleton
- [x] NestJS 11 project in `backend/` with the `common/` + `modules/` layout
- [x] `main.ts` sets global prefix `api/v1`
- [x] Global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`
- [x] CORS restricted to the configured frontend origin
- Verify: `npm run start:dev`, then `GET /api/v1/health` returns `{"status":"ok"}`.

### M1.2 — Typed configuration
- [x] `common/config` with `@nestjs/config` and a typed `RootConfig` interface
- [x] Joi schema validating only variables the app actually reads
- [x] `.env` git-ignored, `.env.example` committed
- Verify: a malformed `PORT` refuses to boot; `.env.example` matches the schema.

### M1.3 — Toolchain
- [x] ESLint + Prettier configured
- [x] Jest configured for unit specs, separate config for e2e
- [x] Health module with a passing unit spec
- Verify: `npm test` in `backend/` passes (currently 1 suite, 1 test).

### M1.4 — Cross-cutting concerns
- [ ] Global exception filter producing `{ statusCode, message, error, requestId }`
- [ ] Request-id interceptor and structured JSON logging
- [ ] Internal errors never leak stack traces or Prisma messages
- [ ] `@nestjs/throttler` global rate limit, stricter on `/auth/*`
- [ ] Shared pagination DTO in `common/dto`
- Verify: an e2e test asserts the error envelope shape and that a 500 leaks nothing.

---

## Phase 2 — Database

Goal: the schema of `DATABASE.md` exists in PostgreSQL, reachable through Prisma.

### M2.1 — Prisma wiring
- [x] Prisma installed; `prisma/schema.prisma` with the PostgreSQL datasource
- [x] `PrismaService` (connect/disconnect on lifecycle hooks) + global `PrismaModule`
- [x] `DATABASE_URL` added to config, Joi schema, and `.env.example`
- Verify: the app boots against Docker Postgres; `/health` reports the database reachable.
- Verified 2026-08-21: `prisma/schema.prisma` holds only the `postgresql` datasource
  and `prisma-client-js` generator — no models yet, per the M2.2+ split below.
  `npx prisma migrate dev --name init` connected successfully and reported "Already
  in sync, no schema change or pending migration was found" (nothing to diff with
  zero models), so no `prisma/migrations/` folder was created; Prisma did create the
  `_prisma_migrations` tracking table in the database, confirming connectivity
  end-to-end. `npx prisma generate` produced the client. `PrismaService` is wired
  into a global `PrismaModule`, connecting in `onModuleInit` and disconnecting in
  `onModuleDestroy`. `HealthService` now runs `SELECT 1` through Prisma; built with
  `npm run build` and run via `node dist/main.js` against the Docker Postgres
  container on port 5433, `GET /api/v1/health` returned
  `{"status":"ok","database":"ok"}`. `npm test` passes (2 suites/tests, including a
  new database-down case). The first real migration (`User`/`Profile`/`RefreshToken`)
  is M2.2, not this milestone.

### M2.2 — User and auth tables
- [x] `User`, `Profile`, `RefreshToken`, `UserRole` enum (`DATABASE.md` §3.1)
- [x] Email stored lowercased/trimmed with a unique constraint
- [x] First migration committed
- Verify: `prisma migrate dev` applies cleanly; `prisma studio` shows the tables.
- Verified 2026-08-21: `prisma/schema.prisma` gained `User`, `Profile`,
  `RefreshToken`, and `UserRole` (plus `WorkplaceType`, needed by
  `Profile.workplaceTypes`). Migration `20260821171157_add_user_auth_tables`
  applied cleanly against Docker Postgres. `User.email` is `@unique`; the DTO
  layer trims/lowercases before it reaches Prisma. `User.savedJobs` from
  `DATABASE.md` §3.1 is intentionally deferred — `SavedJob`/`Job` don't exist
  until M2.4/M2.5.

### M2.3 — Source and ingestion tables
- [x] `JobSource`, `IngestionRun`, `RawJobDocument` (§3.2)
- [x] `RawJobDocument` keyed by content hash, so an unchanged re-fetch writes no row
- Verify: inserting the same payload twice produces one row.
- Verified 2026-08-21: `prisma/schema.prisma` gained `JobSource`, `IngestionRun`,
  `RawJobDocument` and the `AccessMethod` / `IngestionStatus` / `IngestionTrigger`
  enums, field-for-field as `DATABASE.md` §3.2. Migration
  `20260821180642_add_source_ingestion_tables` applied cleanly against Docker
  Postgres; `prisma validate` passes and the client regenerates. Checked in the
  database: inserting the same `(sourceId, externalId, contentHash)` twice leaves
  **one** row (the second insert is a no-op under `ON CONFLICT DO NOTHING`, and a
  plain re-insert is rejected by `RawJobDocument_sourceId_externalId_contentHash_key`),
  while a changed payload — same item, new hash — does write a second row. Deleting
  an `IngestionRun` nulls `RawJobDocument.ingestionRunId` and keeps the document
  (`onDelete: SetNull`); deleting a `JobSource` that still has documents is refused
  (RESTRICT). All §7 index-inventory entries for these three tables exist. Backend
  `npm test` passes (8 suites / 40 tests) and `npm run build` succeeds.
  `JobSource.postings` is intentionally deferred — `JobPosting` does not exist until
  M2.4. No ingestion service was written; that is Phase 5. No `pg_trgm` or search
  index work; that is M2.6.
- ~~Known unrelated failure~~ — **resolved 2026-08-21** at the start of M2.4. The stale
  `test/app.e2e-spec.ts` assertion now expects `{ status: 'ok', database: 'ok' }`, matching
  what `HealthService` has returned since M2.1. `npm run test:e2e` passes (2 suites / 18 tests).

### M2.4 — Job tables
- [x] `JobPosting` and `Job` per §3.3 — **no salary columns** (D7, §3.4)
- [x] `@@unique([sourceId, externalId])` on `JobPosting`
- [x] `Job.dedupHash` UNIQUE; `Job.mergedIntoJobId` self-relation
- [x] Non-null `language`; `technologies` as `String[]`
- Verify: a second `Job` with the same `dedupHash` is rejected by the database.
- Verified 2026-08-21: `prisma/schema.prisma` gained `JobPosting`, `Job` and the
  `EmploymentType` enum, field-for-field as `DATABASE.md` §3.3. Migration
  `20260821182202_add_job_tables` applied cleanly against Docker Postgres;
  `prisma validate` passes and the client regenerates. Checked in the database:
  a second `Job` with the same `dedupHash` is **rejected** by `Job_dedupHash_key`
  (D1) while a different hash is accepted; re-inserting the same
  `(sourceId, externalId)` is rejected by `JobPosting_sourceId_externalId_key`
  (dedup tier 1); a posting inserts fine with `jobId` NULL, the pre-dedup state;
  setting `mergedIntoJobId` on one `Job` to point at another works (D2); deleting a
  `Job` nulls `JobPosting.jobId` and keeps the posting (`onDelete: SetNull`);
  deleting a `JobSource` that still has postings is refused (RESTRICT).
  `information_schema` confirms **no column matching `%salar%`** on either table
  (D7, §3.4). All §7 index-inventory entries for these two tables that Prisma can
  express exist. `JobSource.postings` is no longer deferred. Backend `npm test`
  passes (8 suites / 40 tests), `npm run test:e2e` passes (2 suites / 18 tests),
  `npm run build` and `eslint` are clean.
- Deferred by decision, not oversight: §3.3 also lists `Job`'s denormalized
  classification block (`juniorLevel`, `juniorScore`, `requiredMinYears`,
  `requiredMaxYears`, `classifiedAt`) plus the `JuniorLevel` enum and the two `Job`
  indexes leading with those columns — but M2.5's checklist explicitly claims the
  same four fields. That overlap was raised and resolved in favour of M2.5, which
  adds them alongside the `JobClassification` rows that populate them. `Job.postings`
  and `Job.mergedInto`/`mergedFrom` exist now; `Job.classifications` and `Job.savedBy`
  wait for M2.5. No `searchVector`, GIN, trigram, partial or CHECK work — that is M2.6.

### M2.5 — Classification and saved-job tables
- [x] `JobClassification`, `SavedJob`, and the enums of §3.6
- [x] Denormalized `juniorLevel`, `juniorScore`, `requiredMinYears`, `requiredMaxYears`,
      `classifiedAt` on `Job`, plus the `JuniorLevel` enum and the two `Job` indexes that
      lead with those columns (`@@index([juniorLevel, effectivePostedAt(sort: Desc)])`,
      `@@index([juniorScore(sort: Desc), effectivePostedAt(sort: Desc)])`) — §3.3 lists
      them on `Job`, but they belong here, with the classification that populates them
- [x] Partial unique index: exactly one `isCurrent` classification per job
- Verify: inserting a second `isCurrent = true` row for one job fails.
- Verified 2026-08-21: `prisma/schema.prisma` gained `JobClassification`, `SavedJob`
  and the `JuniorLevel` enum, field-for-field as `DATABASE.md` §3.5/§3.6, plus
  `Job`'s denormalized classification block and its two indexes from §3.3. Of the
  seven enums in §3.6 only `JuniorLevel` was outstanding; the other six landed in
  M2.2–M2.4. Migration `20260821184731_add_classification_saved_job_tables` applied
  cleanly against Docker Postgres; `prisma validate` passes and the client
  regenerates. The partial unique index is **hand-written SQL appended to the
  generated migration** — Prisma cannot express it (§5); M2.5's checklist claims it
  and owns its verify step, so it lands here rather than with the rest of §5.
  Checked in the database (all inside one rolled-back transaction): the M2.5 verify
  passes — a second `isCurrent = true` row for one job is **rejected** by
  `JobClassification_one_current_idx`, while a superseded `isCurrent = false` row
  for that same job is accepted and a *different* job keeps its own current row;
  re-inserting the same `(jobId, classifierVersion, inputHash)` is rejected by
  `JobClassification_jobId_classifierVersion_inputHash_key`; saving the same job
  twice for one user is rejected by `SavedJob_userId_jobId_key` while a second,
  different job saves fine; deleting a `Job` cascades away its classifications and
  saves, and deleting a `User` cascades away theirs. `information_schema` confirms
  **no column matching `%salar%`** (D7, §3.4) and no column named `probability`,
  `chance`, `likelihood` or `successRate` anywhere in the schema (§4.2).
  `User.savedJobs`, deferred since M2.2, is no longer deferred; `Job.classifications`
  and `Job.savedBy` are wired. Backend `npm test` passes (8 suites / 40 tests),
  `npm run test:e2e` passes (2 suites / 18 tests), `npm run build` and `eslint` are
  clean. No classifier, scoring or saved-jobs service code was written — those are
  Phases 8 and 10.
- Deferred to M2.6 by decision, not oversight: the §5 CHECK constraints over columns
  this milestone creates (`Job_juniorScore_range`, `JobClassification_score_range`,
  `JobClassification_years_order`). §3.3/§3.5 annotate those columns "CHECK enforced"
  but M2.6's checklist explicitly claims "CHECK constraints from §5". The overlap was
  raised and resolved in favour of M2.6, keeping §5's raw-SQL block as one unit; the
  gap is harmless because nothing writes to these columns until Phase 8, well after
  M2.6. Confirmed absent in the database: no `pg_trgm`, no `searchVector`, no CHECK
  constraint on `Job` or `JobClassification`, and no `Job_active_search_idx` — the
  partial index leads with `juniorScore` but is raw SQL and belongs to M2.6.

### M2.6 — Raw SQL migration
- [x] `pg_trgm` extension enabled
- [x] Language-aware generated `tsvector` column on `Job` plus its GIN index (§5)
- [x] GIN index on `technologies`; CHECK constraints from §5
- [x] Index inventory of §7 created
- Verify: `EXPLAIN` on a full-text query uses the GIN index, not a sequential scan.
- Verified 2026-08-21: migration `20260821190950_add_search_indexes_and_checks`
  (committed as `f3cb483`) applies §5's raw SQL — `pg_trgm`, the generated
  `Job.searchVector`, the three GIN indexes, the partial `Job_active_search_idx`, and
  all four CHECK constraints. §5's `JobClassification_one_current_idx` is deliberately
  **not** repeated: M2.5's migration created it and keeps ownership. Checked against
  the live database, not merely that the migration ran:
  - `pg_trgm` v1.6 installed; `similarity()` callable.
  - `searchVector` is a genuinely generated column (`pg_attribute.attgenerated = 's'`),
    not the plain `tsvector` Prisma first generated. A `de` row's stored vector equals
    the **german**-configuration expression and differs from the english one, so D3's
    CASE is load-bearing rather than decorative. Direct writes to the column are
    rejected by PostgreSQL; the vector recomputes on a title edit and on a `de`→`en`
    language flip.
  - All four CHECKs tested at their boundaries: `-1` and `101` rejected while `0` and
    `100` are accepted, `NULL` accepted for an unclassified job; `minYears 5 >
    maxYears 2` rejected while `2 ≤ 5`, `3 = 3` and either-side-NULL are accepted;
    `Profile.yearsOfExperience` `-1`/`61` rejected, `0`/`60`/`2` accepted.
  - The verify line passes at realistic volume: over 5001 rows the English and German
    full-text queries, the weighted `ts_rank` ordering, the `technologies` containment
    filter, the trigram title match and the default search ordering each use their
    index with **no** Seq Scan. The first attempt failed misleadingly because the rows
    were bulk-loaded inside a transaction, leaving every GIN entry in the pending list
    and inflating the planner's cost estimate; `VACUUM` cannot run inside a
    transaction block, so the check must load, `VACUUM ANALYZE`, `EXPLAIN`, then clean
    up. Worth knowing before M2.7's seed fixtures are used for the same purpose.
  - §7 index inventory audited end to end: **25/25 entries present**. The only indexes
    in the database that §7 does not list are `@unique` constraints declared in §3
    models plus the two `IngestionRun` indexes — §7 does not restate those.
  - Backend `npm test` passes (8 suites / 40 tests), `npm run test:e2e` passes
    (2 suites / 18 tests), `npm run build` and `npm run lint` are clean. A bare
    `npx eslint .` reports errors from `dist/`; the project's `lint` script scopes to
    `{src,apps,libs,test}` and is the one that counts.
- **Fragile point — Prisma drift will try to destroy this milestone's work.** Run
  `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel
  prisma/schema.prisma --script` and Prisma proposes changes it believes reconcile the
  database with the schema. Before mitigation it wanted to `DROP` all three GIN indexes
  **and** strip the generated column. Mitigation: the three GIN indexes are now declared
  in `schema.prisma` with `map:` pinning the names the migration already created — the
  same "raw SQL creates it, the schema declares it so Prisma leaves it alone" pattern
  §5 already mandates for `searchVector Unsupported("tsvector")?`. That is a judgment
  call slightly beyond §5's literal text, recorded here rather than left implicit.
  After it, the diff is down to one irreducible statement, `ALTER TABLE "Job" ALTER
  COLUMN "searchVector" DROP DEFAULT`, because Prisma has no concept of a generated
  column. PostgreSQL **rejects** that statement outright (`42601`, "is a generated
  column"), so it fails loudly instead of silently dropping the expression — but it
  means **`prisma migrate dev` can never be run bare on this schema.** Always
  `--create-only`, then read the generated SQL before applying. Anyone adding a model
  in Phase 3+ hits this.
- **Known issue — M2.5's migration checksum was stale and was repaired, not reset.**
  M2.5's partial unique index was hand-appended to `20260821184731_...` *after* Prisma
  had already applied that file, so the `_prisma_migrations` checksum recorded the
  pre-edit content (`e678072d…`) while the file hashed to `b7f19a35…`. This blocked
  `migrate dev` with "the migration was modified after it was applied". `migrate reset`
  was rejected by tooling policy, so the non-destructive route was taken: every
  application table was confirmed to hold 0 rows and every object the edited file
  produces was confirmed already present in the database, then the recorded checksum
  was updated to the file's actual hash. The recorded state is now accurate.
  **Still unproven: that migration has never been applied from scratch as it now
  stands.** A fresh `prisma migrate deploy` against a throwaway database would close
  this, and is worth doing before anyone relies on the migration chain in CI.

### M2.7 — Seed script
- [x] Seed creates a demo user and a fixture job set with classifications
- [x] Fixtures include English and German postings, and the adversarial case
      ("Junior" title, `5+ years` in the body)
- [x] Idempotent — re-running does not duplicate rows
- Verify: seeding twice leaves identical row counts.
- Verified 2026-08-22: `backend/prisma/seed.ts` (the runner) and
  `backend/prisma/seed-data.ts` (the typed fixtures), wired as `npm run db:seed`
  via `package.json#prisma.seed`. Baseline: 2 `JobSource`, 2 `User`, 1 `Profile`,
  10 `Job`, 11 `JobPosting`, 10 `JobClassification`, 2 `SavedJob`.
  - **The verify line passes, and the stronger form of it passes too.** Three
    consecutive runs leave those counts unmoved, and every `Job`, `User`,
    `JobPosting` and `SavedJob` **primary key is byte-identical** across runs — so
    rows are being updated, not deleted and recreated. Counts alone would not have
    shown that: a delete-then-insert seed also leaves counts identical while
    silently invalidating every foreign key a developer had bookmarked.
  - Idempotency is structural, not defensive: every write is an `upsert` on a
    natural key the schema already enforces as unique — `User.email`,
    `Profile.userId`, `JobSource.key`, `Job.dedupHash` (D1),
    `JobPosting(sourceId, externalId)` (dedup tier 1),
    `JobClassification(jobId, classifierVersion, inputHash)`, and
    `SavedJob(userId, jobId)`. The seed never deletes.
  - Fixture coverage, checked against the live database: all five `JuniorLevel`
    bands present; 7 English and 3 German jobs; the adversarial case
    (`Junior Java Developer`, body demanding `5+ years` and leading a team) stored
    as `CLEARLY_EXPERIENCED` / score 6 / `requiredMinYears = 5`; one job carried by
    both sources; one inactive job; one merged-away job redirecting via
    `mergedIntoJobId`; one job with a null `postedAt` exercising
    `effectivePostedAt`'s coalesce.
  - D3's language split is genuinely exercised, not merely labelled. All three `de`
    rows' stored `searchVector` equals the **german**-configuration expression, and
    `to_tsquery('german','berufserfahrung')` matches rows that
    `to_tsquery('english','berufserfahrung')` does not. Umlauts survive the write
    intact (`Für`, `Verstärkung`, `regelmäßige`).
  - The `isCurrent` partial unique index of M2.5 holds a real hazard the seed had to
    handle. Editing a fixture's description changes its `inputHash`, so the next run
    inserts a **new** classification row — which collides with the index against the
    existing `isCurrent` row unless the old one is stood down **first**. Verified by
    actually editing a fixture and re-seeding: `JobClassification` went 10 → 11 with
    every other count unmoved, the old row flipped to `isCurrent = false`, the new
    one carried `true`, and no job ended with anything other than exactly one current
    classification. Rows are never deleted, per §3.5.
  - Backend `npm test` passes (8 suites / 40 tests), `npm run test:e2e` passes
    (2 suites / 18 tests), `npm run build` and `npm run lint` are clean — unchanged
    from M2.6's baseline, so nothing regressed. `prisma/` sits outside the `lint`
    script's `{src,apps,libs,test}` glob, so the two new files were linted and
    Prettier-checked directly and are clean.
- **The seed is not a classifier and not a normalizer.** Every canonical value in
  the fixtures — `normalizedTitle`, `companySlug`, and every level, score, signal
  and verbatim `evidence` excerpt — is **hand-written to be internally consistent**,
  because the logic that would derive them is Phases 6–8. The one formula the seed
  applies itself is D1's `sha256(companySlug | normalizedTitle | countryCode)`.
  Classifications are stamped `classifierVersion = "seed-fixture-1.0"`, deliberately
  **not** `rules-1.0` or `llm-1.0`: labelling hand-written fixtures as a classifier's
  output would poison the offline evaluation that `(classifierVersion, createdAt)`
  is indexed for (§3.5). When Phases 6–8 land, this corpus is the obvious thing to
  check real logic against — a disagreement is then a finding, not a bug in the seed.
- **Compliance note on the two fixture `JobSource` rows.** `accessMethod` is meant to
  be a truthful record of how a real source may be used (`ARCHITECTURE.md` §7.1), and
  the enum has no value meaning "synthetic local fixture". The nearest plausible
  values were used (`PUBLIC_API`, `OFFICIAL_FEED`) with display names and
  `attributionText` stating plainly that the data is synthetic and unreviewed.
  Neither row is approval of any real source; `docs/SOURCES.md` remains the only
  place that grants that. Worth revisiting if M5.2 finds the ambiguity unacceptable —
  the fix would be a `FIXTURE` enum value, which is a migration and was out of scope
  here.
- **Known issue — the `package.json#prisma` config key is deprecated.** Prisma 6.19
  warns on every `db:seed` run that it is removed in Prisma 7, in favour of a
  `prisma.config.ts` file. Not migrated here, deliberately: adopting `prisma.config.ts`
  **stops the Prisma CLI from auto-loading `.env`**, which would silently break every
  `migrate` and `seed` invocation in this repo until the config loads it explicitly.
  That is a change to how migrations resolve their connection, and it does not belong
  inside a seed milestone. It must be handled before any Prisma 7 upgrade.
- Two small additions beyond the checklist's literal wording, both recorded rather
  than left implicit: a second `User` with `role = ADMIN`, so M3.5's `RolesGuard` can
  be exercised locally at all (there is still no admin UI and no role-management
  endpoint, per D4); and the inactive and merged-away job fixtures, so M4.1's redirect
  and M4.2's exclusion rules have data to be verified against.
- No Jest spec was added for the seed. Its `Verify:` line is behavioural — seed twice,
  compare counts — and it was checked against the real database, which a spec over a
  mocked Prisma client could not have proven. `CLAUDE.md`'s testing priorities cover
  business logic; the seed contains none, by design.

---

## Phase 3 — Authentication and Users

Goal: a user can register, log in, hold a session, and own a search profile.

### M3.1 — Password hashing
- [x] `argon2id` hashing service (bcrypt fallback if native builds fight Windows)
- [x] Unit tests: hash never equals plaintext, verify true/false, distinct salts
- Verify: `npm test` covers the hashing service.
- Verified 2026-08-21: `PasswordHasherService` (`modules/auth/`) wraps `argon2`
  (argon2id, native build works cleanly on this Windows machine — bcrypt fallback
  not needed). `password-hasher.service.spec.ts`: hash ≠ plaintext, verify
  true/false, distinct salts per hash, malformed hash returns `false` instead of
  throwing.

### M3.2 — Register and login
- [x] `POST /auth/register` — DTO validation, duplicate email returns 409
- [x] `POST /auth/login` — returns access + refresh token
- [x] Identical failure response for unknown email and wrong password
- Verify: e2e register → login issues tokens; a duplicate register returns 409.
- Verified 2026-08-21: `AuthController`/`AuthService` (`modules/auth/`). Duplicate
  email (including case-only differences) maps Prisma `P2002` → 409. Login runs a
  password-hash verification against a fixed dummy hash even when the email is
  unknown, so unknown-email and wrong-password return byte-identical 401 bodies.
  `test/auth.e2e-spec.ts` covers both.

### M3.3 — JWT access tokens
- [x] `JwtAuthGuard` registered globally with a `@Public()` opt-out decorator
- [x] ~15 minute access token carrying `sub` and `email`
- [x] `JWT_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` in config, Joi, `.env.example`
- Verify: e2e — a protected route 401s without a token and 200s with one.
- Verified 2026-08-21: `JwtAuthGuard` (`modules/auth/guards/`) is registered as a
  global `APP_GUARD`; `@Public()` (`common/decorators/`) opts out — applied to the
  three unauthenticated auth routes and to the pre-existing `HealthController`,
  which had no guard before this guard went global. `JWT_SECRET` is required with
  a minimum length of 32 and no default, so the app refuses to boot on a weak
  secret. `GET /users/me` (M3.6) is the protected route exercised by the e2e
  401-without / 200-with-token case.

### M3.4 — Refresh token rotation
- [x] Opaque refresh token; only its hash stored in `RefreshToken`
- [x] `POST /auth/refresh` rotates and invalidates the previous token
- [x] `POST /auth/logout` revokes
- [x] Reuse of an already-rotated token is rejected
- Verify: e2e — refreshing twice with the same token fails on the second attempt.
- Verified 2026-08-21: `RefreshTokenService` (`modules/auth/`) issues a 32-byte
  random token, stores only its sha256, and rotates old→new inside one
  `prisma.$transaction`. Reuse of a revoked token also revokes every other live
  token for that user (containment on suspected theft). `refresh-token.service.spec.ts`
  (unit) and `test/auth.e2e-spec.ts` (e2e, including the required "refresh twice
  with the same token" case) both pass.

### M3.5 — Role guard
- [x] `RolesGuard` reading `User.role`, guarding admin-only routes
- [x] No admin UI and no role-management endpoint (per D4)
- Verify: a `USER` token receives 403 on an `ADMIN` route.
- Verified 2026-08-22: `RolesGuard` (`modules/auth/guards/`) plus `@Roles()`
  (`common/decorators/`, alongside `@Public()` for the same reason — it is applied
  by feature modules, not by auth). Registered as a second global `APP_GUARD` in
  `AuthModule`.
  - **Registered globally, opt-in by metadata**, not applied per route with
    `@UseGuards`. A route carrying no `@Roles()` passes straight through, so the
    guard only ever narrows access `JwtAuthGuard` already granted — and adding
    `@Roles(ADMIN)` is by itself sufficient to protect a handler. There is no
    second step to forget when M5.5 adds the ingestion trigger.
  - **The role is read from the database on every request, not from the JWT.** The
    access token carries only `sub` and `email` (§9), and adding a role claim
    would mean a demotion took effect up to 15 minutes late. Because D4 gives us
    no role-management endpoint, a role change is a manual database edit — most
    plausibly an emergency revocation, which is exactly the case that must not
    wait out a token. An e2e case demotes an admin holding a live token and
    asserts the next request is 403. The cost is one indexed lookup on admin
    routes only.
  - **Guard order is load-bearing.** Global guards run in provider-registration
    order, and `RolesGuard` reads the `request.user` that `JwtAuthGuard` attaches;
    it must stay below it in `AuthModule`. The e2e asserts an anonymous caller
    gets **401, not 403**, which fails if that order is ever inverted.
  - `@Public()` combined with `@Roles()` is contradictory — authentication is
    skipped, so no identity is attached — and **fails closed**: it is denied and
    logged at `error`, rather than falling open to the handler.
  - A missing account and an unprivileged one return byte-identical 403s, so an
    admin route does not confirm which user ids exist.
- **No admin route exists yet to point this at**, and that is correct: the first
  one is M5.5's manual ingestion trigger. `test/roles.e2e-spec.ts` therefore
  declares its own `@Roles(ADMIN)` controller **in the test file, never in `src/`**,
  so the guard is proven now without shipping an admin surface D4 excludes from the
  MVP. An e2e case also asserts no shipped route can change a role.
- The seed already provisions `admin@juniorjob.local` (M2.7, `DEMO_ADMIN`), so the
  guard is exercisable by hand locally.

### M3.6 — Users and profile
- [x] `GET /users/me`
- [x] `GET /profiles/me` and `PUT /profiles/me` (titles, locations, technologies,
      workplace types, max years)
- [x] A user can only read or write their own profile
- Verify: e2e — user A cannot reach user B's profile.
- Verified 2026-08-22: `modules/profiles/` — `ProfilesModule`, `ProfilesController`,
  `ProfilesService`, `dto/profile.response.ts`, `dto/update-profile.dto.ts`.
  `GET /users/me` is unchanged from 2026-08-21.
  - **Ownership is structural, not a check.** The only route is `/profiles/me`,
    and every service method is keyed by the `userId` taken from the verified
    token — no method accepts a profile id, so there is no parameter through which
    one user could name another's profile. `test/profiles.e2e-spec.ts` asserts two
    users see their own row, that A's write leaves B's untouched, that
    `/profiles/<other-id>` 404s at routing before any handler runs, and that a
    `userId` smuggled in the query string is ignored.
  - **`PUT` replaces, it does not merge.** An omitted field resets to its default.
    This is deliberate: §8 lists no `PATCH` for this resource, so under merge
    semantics a client could never clear a list — "remove my last technology"
    would be inexpressible. `PUT {}` is a full reset.
  - **`GET` on an account that has never saved a profile returns an empty profile,
    not 404.** Registration writes no `Profile` row, and a 404 would force every
    client to special-case a brand-new account before it can render a form.
    `updatedAt: null` is what distinguishes "never saved" from "saved empty".
  - Writes are an upsert, so the first `PUT` creates and later ones update; an
    e2e case asserts three writes leave exactly one row.
  - **Canonicalized at write time per `DATABASE.md` §6**, because comparing
    un-normalized values at read time silently matches nothing: `technologies`
    become lowercase hyphenated slugs, `countryCodes` uppercase alpha-2, free text
    has its whitespace collapsed, blank entries are dropped, and duplicates that
    collapse to the same canonical value are dropped rather than rejected — left
    in, they would double-count in M9.5's profile-fit ranking. The *dictionary*
    mapping synonyms onto canonical slugs is M6.3's and does not exist yet; this
    deliberately does not invent one.
  - `yearsOfExperience` is validated `0–60` to **mirror the `Profile_years_range`
    CHECK constraint** (`DATABASE.md` §5). Validating looser than the database
    would turn a 400 into a 500.
  - Every list is capped at 50 entries and every entry at 100 characters — these
    are search preferences, not a data store, and an uncapped `String[]` is a free
    write-amplification vector on an authenticated endpoint.
  - `ProfileResponse` is a hand-written projection like `UserResponse`; `id` and
    `userId` never leave the service, asserted by an e2e case.
- Checks after the change: backend `npm test` 12 suites / 84 tests and
  `npm run test:e2e` 5 suites / 59 tests pass (from 9/55 and 3/33 — the additions
  are `roles.guard.spec.ts`, `profiles.service.spec.ts`,
  `update-profile.dto.spec.ts`, `test/roles.e2e-spec.ts` and
  `test/profiles.e2e-spec.ts`), `npm run build` clean, `npm run lint` clean, and
  every file touched is Prettier-clean.
- Both new e2e suites create and delete their own users under dedicated
  `@roles-e2e.test` / `@profiles-e2e.test` email domains, so they pass on an
  unseeded database and leave no rows behind (confirmed: 3 users / 1 profile / 10
  jobs before and after, the profile being the seeded demo user's).
- Checked against the **seeded** database with the API running, as M4 was:
  `GET /profiles/me` as `demo@juniorjob.local` returns the seeded profile
  verbatim; as `admin@juniorjob.local` (no row) it returns the empty profile with
  `updatedAt: null`; a `PUT` of `{"technologies":["Spring Boot","JAVA","java"],
  "countryCodes":["de"]}` came back as `["spring-boot","java"]` / `["DE"]`; a
  following `PUT {}` cleared every field; and 61 years, `"GER"`, `"ANYWHERE"` and
  an undeclared `userId` were each 400. The row created by that check was deleted
  afterwards and the seeded profile confirmed unmodified.

---

## Phase 4 — Job Read Model

Goal: the read side serves jobs from the database, before any ingestion exists.

### M4.1 — Jobs module
- [x] `GET /jobs/:id` — canonical job detail
- [x] Response DTO includes classification evidence and every source URL
- [x] `mergedIntoJobId` resolves through a redirect rather than returning a dead job
- [x] Prisma types never leave the service
- Verify: e2e against seeded data returns the detail; a merged job resolves.
- Verified 2026-08-22: `modules/jobs/` — `JobsModule`, `JobsController`,
  `JobsService`, `dto/job-detail.response.ts`. Both routes are `@Public()`
  (`ARCHITECTURE.md` §8 lists them as optional-auth), and `:id` is parsed by
  `ParseUUIDPipe`, so a malformed id is a 400 and an unknown one a 404.
  - Checked against the **seeded** database with the API running, not only
    against test-owned fixtures: `GET /jobs/8264d3a4…` (the two-source fixture)
    returns the detail with all five positive signals, their verbatim `evidence`,
    the summary, and both source URLs with each source's `attributionText` — the
    data §7.4 requires the UI to render attribution from.
  - The redirect resolves for real: `GET /jobs/e57ae2cf…` (the merged-away
    `Graduate Software Developer`) returns `16fce972…` `Graduate Software
    Engineer`, with `redirectedFromJobId` carrying the requested id back so a
    client holding the old link can update it. Resolution walks the chain reading
    only `{ id, mergedIntoJobId }` and fetches the full row once, at the end.
  - **A merge cycle or a chain over 8 hops returns 404, not the tombstone it
    stopped on.** Serving a merged-away job is the one thing this milestone
    forbids, and corrupt merge data should be loud. Both cases log at `error`.
  - Prisma types stay inside the service. Every query uses an explicit `select`,
    both DTOs are hand-written projections with `fromEntity` factories over
    locally declared row interfaces, and an e2e case asserts `dedupHash`,
    `normalizedTitle`, `companySlug`, `searchVector` and `postings` are all
    absent from the response body.
- **An inactive job is still served by id.** Only lists exclude it. A user who
  saved a job that has since gone stale must still be able to open it — nothing a
  user can reach is hard-deleted (`DATABASE.md` §8), so a 404 there would strand
  every `SavedJob` row pointing at it.
- Signals are parsed defensively rather than trusted. They are JSON with no
  database constraint (§4.1), so a malformed entry drops out and the rest of the
  explanation still renders, instead of one bad row failing the whole job detail.

### M4.2 — Job list contract
- [x] Paginated envelope `{ items, page, pageSize, total }`, `pageSize` at most 50
- [x] Inactive and merged jobs excluded
- Verify: an e2e test asserts the envelope and both exclusions.
- Verified 2026-08-22: `GET /jobs` in the same module, with the envelope and the
  page/pageSize query DTO in `common/dto/` (`paginated.response.ts`,
  `pagination.query.ts`) because every later list endpoint shares them.
  `pageSize` defaults to 20 and is capped at 50 by `@Max`; `?pageSize=51`,
  `?page=0`, `?page=abc` and `?pageSize=1.5` are all 400, and `?sort=relevance`
  is 400 today because `forbidNonWhitelisted` rejects parameters no DTO declares
  — that one becomes valid at M9.3 when the search DTO adds it.
  - Against the seeded database: 10 `Job` rows, `total = 8`. The inactive
    `Junior QA Engineer` and the merged-away `Graduate Software Developer` are
    the two missing, both by `where: { isActive: true, mergedIntoJobId: null }`.
  - Items and `total` are read in one `$transaction`, so a concurrent ingestion
    cannot make the count disagree with the page it describes. Ordering is
    `effectivePostedAt DESC, id DESC` — the `id` tiebreak is what stops two jobs
    sharing a timestamp from swapping places between page 1 and page 2 and hiding
    a row from anyone paging through.
  - List items carry `sourceCount` (distinct sources, not postings — a source can
    hold two postings for one job) and deliberately omit `description`: it is the
    largest column on the table and 50 of them is a needless payload.
- **The structural exclusion only.** `PRODUCT.md` §8 also wants the default result
  set to hide `CLEARLY_EXPERIENCED` and, unless opted in, `EXPERIENCED`. That is
  the *default search set* (M9.3), not the list contract, and applying it here
  would have silently pre-empted a product rule this milestone was not asked to
  implement. `GET /jobs` therefore still returns the `Lead Platform Engineer` and
  the adversarial `Junior Java Developer` fixtures.
- Both routes are `@Public()`, which skips authentication rather than making it
  optional — so no user is attached even when a token is sent. **M9.5's
  profile-fit ranking needs a guard that attaches the user when a token is present
  and still allows none**; `@Public()` cannot express that, and this is the point
  where it will have to be added.
- Checks after the change: backend `npm test` 9 suites / 55 tests and
  `npm run test:e2e` 3 suites / 33 tests pass (from 8/40 and 2/18 — the additions
  are `jobs.service.spec.ts` and `test/jobs.e2e-spec.ts`), `npm run build` and
  `npm run lint` clean, and every file touched is Prettier-clean.
- `test/jobs.e2e-spec.ts` **creates and deletes its own** sources, jobs, postings
  and classification rather than asserting against `npm run db:seed`, so it passes
  on a database that has never been seeded and leaves no rows behind (confirmed:
  10 `Job` rows before and after). The seeded-data check above was run separately,
  by hand, against the live API — that is what closes M4.1's `Verify:` line.
- **Known issue — `npm run start:prod` is broken, and not by this milestone.**
  `nest build` now emits `dist/src/main.js`, not `dist/main.js`, because
  `prisma/seed.ts` (M2.7, untracked) sits outside `src/` and imports from it,
  which moves TypeScript's computed root. `start:prod` still points at
  `dist/main`. The verification above used `node dist/src/main.js`. This must be
  fixed before M13.2 (deployment) — either by pinning `rootDir`/`include` for the
  build or by excluding the seed from it.

---

## Phase 5 — Job Ingestion

Goal: an orchestrated pipeline that runs end to end against fixtures, with no
source-specific knowledge outside `sources/`.

**Architecture decisions — approved 2026-08-21.** The adapter design was reviewed
and accepted before implementation; these are binding on Phase 5 and recorded in
`ARCHITECTURE.md` §6.1.

| # | Decision | Resolution |
| - | -------- | ---------- |
| A1 | Adapter return type | **`AsyncIterable<RawJob>`**, not `Promise<RawJob[]>`. The orchestrator owns pagination, backpressure, and early termination; adapters implement one page. `ARCHITECTURE.md` §6.1 amended accordingly. |
| A2 | Compliance metadata | A validated **`SourceDescriptor`** on every adapter — the machine-readable twin of the §7.3 header comment. Registration **refuses to boot** on a missing `accessMethod`, `termsUrl`, or `complianceNote`. |
| A3 | Descriptor vs. database authority | **Code wins** for compliance fields, synced one-directionally into `JobSource`. The database owns only `enabled`, so a source can be stopped without a deploy. |
| A4 | Source review record | **`docs/SOURCES.md`** — one auditable entry per reviewed source, including sources reviewed and **rejected**, per `ARCHITECTURE.md` §7.5. |
| A5 | Stale-run reaper | Owned by **M5.3**, not M5.6. The `RUNNING` concurrency guard depends on it, so they ship together. |
| A6 | Fixture adapter in production | **Ships in all builds.** It makes a production smoke test possible without touching a real source. |
| A7 | HTTP client | Node 24 global `fetch` + `AbortSignal.timeout`. No `axios`, no `@nestjs/axios`. |

**Resolved 2026-08-22 — which queries ingestion runs (`ARCHITECTURE.md` §14.5).** A
curated per-source **ingestion plan** of `{ query, location }` seeds, declared in
code, with `since` taken from the last successful run's `startedAt` minus an overlap
window (§6). The seeds are product tuning rather than compliance metadata, and a
source that takes no query declares one empty seed.

**Sequencing decision.** That unblocks M5.4, but M5.4 is deliberately sequenced
**after Phases 6–8**: it orchestrates fetch → raw → normalize → dedupe → classify →
score, and wiring stages that do not exist yet would mean stubbing them and
rewriting the orchestrator once each arrives. M5.1–M5.3 (fetch and raw) ship first,
Phases 6–8 build the stages, then M5.4 wires them and M5.5–M5.6 follow.

### M5.1 — Source adapter abstraction
- [x] `JobSourceAdapter` interface plus `RawJob` / `SourceFetchParams` /
      `FetchContext` / `SourceDescriptor` types (§6.1, A1 + A2)
- [x] `SOURCE_ADAPTERS` injection token array
- [x] `SourceRegistryService` — resolve by key, validate descriptors, reject duplicates
- [x] `PaginatedSourceAdapter` base driving `fetchPage` → `AsyncIterable<RawJob>`,
      owning the page cap, cursor-progress check, and `since` early-stop
- [x] A `FixtureSourceAdapter` reading local JSON fixtures — the development source (A6)
- [x] Shared `describeAdapterContract` conformance suite every adapter must pass
- [x] Nothing outside `sources/` imports a concrete adapter or a source-specific field
- Verify: a unit test resolves adapters through the token; an import check confirms
  no domain module imports `sources/` and no adapter imports an HTTP library.
- Verified 2026-08-22: `modules/sources/` — `source-adapter.types.ts`,
  `source-adapters.token.ts`, `source-descriptor.validator.ts`,
  `source-registry.service.ts`, `paginated-source.adapter.ts`,
  `testing/adapter-contract.ts`, `adapters/fixture/`, `sources.module.ts`.
  - **Descriptor validation runs in the registry's constructor, not a lifecycle
    hook**, so an invalid or duplicated descriptor aborts boot (A2) rather than
    failing on the first run, when nobody is watching. A case asserts that
    `Test.createTestingModule(...).compile()` itself rejects.
  - **The base owns the loop; adapters implement one page** (A1). Page cap,
    cursor-progress check, `since` early-stop, `limit` and abort all live in
    `PaginatedSourceAdapter`. A repeated cursor ends the run after 2 requests, not
    50 — without that check an adapter bug becomes an unbounded request loop against
    a third party, which is exactly what §7.2 forbids.
  - **The `since` early-stop applies only to `RECENT_FIRST` sources.** For
    `UNSPECIFIED` ordering a later page may still hold newer postings, so old items
    are filtered but the walk continues. Stopping early there would silently
    truncate every run that passes `since`.
  - **The base deliberately does not validate a `RawJob`'s shape.** Throwing an item
    error from inside an async generator kills the stream, which would defeat
    "item-level failures degrade"; the check lives in `RawIngestionService`, next to
    the `failed` counter it feeds. `describeAdapterContract` is what holds adapters
    to the shape.
  - `sources.imports.spec.ts` is the import check. It parses import specifiers
    rather than raw text, so a mention inside a comment is not a false failure, and
    asserts: no domain module imports `sources/`; nothing outside `sources/` names a
    concrete adapter; no adapter imports an HTTP library or calls bare `fetch(`; and
    none of `axios` / `@nestjs/axios` / `node-fetch` / `got` / `undici` appears in
    `package.json`. `ingestion` is exempt by design — §4.3 has it depending on
    `sources`, and the arrow points one way only.

### M5.2 — Compliance guardrails
- [x] Adapter header-comment requirement documented in `sources/README.md`
- [x] `docs/SOURCES.md` review register established, with the §7.5 checklist (A4)
- [x] Shared HTTP client sending a truthful User-Agent with a contact address (A7)
- [x] Adapters cannot reach the network directly — client injection is the only path
- [x] Conservative per-source client-side rate limiting; retries only on `5xx`/network
- [x] `401`, `403`, `429` and block pages are stop conditions that end the run
- [x] Typed `SourceError` hierarchy: item-level failures degrade, run-level failures stop
- Verify: a unit test shows a 429 ends the run and logs, with no retry storm.
- Verified 2026-08-22: `sources/README.md`, `sources/source-errors.ts`,
  `sources/http/source-http-client.ts`, `sources/http/rate-limiter.ts`.
  - **A 429 ends the run after exactly one request with no backoff sleep**, asserted
    directly. Retrying into a 429 exceeds a rate limit, which §7.2 prohibits, and is
    precisely the retry storm the policy exists to prevent — the next scheduled run
    tries again. `retry-after` is surfaced on the error but deliberately not acted
    on. 401 and 403 behave the same way. Retries apply to 5xx and network failures
    only, bounded at 3 attempts, with exponential backoff plus jitter.
  - **Block-page detection exists to stop, never to evade.** §7.2 prohibits solving
    or routing around a challenge, so ending the run is the only permitted response.
    The code and the README both say so at the exact point where someone would be
    tempted to make the detection smarter to get a request through.
  - The User-Agent is `JuniorJobAI (+<contact>)`, from the new
    `SOURCE_USER_AGENT_CONTACT` (configuration, Joi, `.env.example`), defaulting to
    this repository — a real and reachable contact route. **No version segment**: a
    hard-coded one drifts into a falsehood the moment it is not bumped, and this
    field's only job is to be true. A test asserts it never matches a browser string.
  - `SourceError` carries an abstract `terminatesRun`, so callers branch on a flag
    rather than string-matching a message. `SourceItemError` degrades; every
    `SourceRunError` subclass stops the run.
  - The rate limiter is per source key and serializes concurrent acquisitions
    through a promise chain — without that, concurrency is a way to burst straight
    past the ceiling §7.3.3 requires. Its clock and sleep are injected, so its spec
    runs on virtual time rather than real delays.
  - **`docs/SOURCES.md` already existed** with the §7.5 checklist and entry
    template, so this box was already satisfiable. Added to it: a "Not a source:
    `fixture-board`" section recording why the fixture adapter has no review entry
    and needs none, so a `JobSource` row in a database can never be mistaken for
    evidence that some source cleared review.

### M5.3 — Raw persistence
- [x] `RawJobDocument` written with a content hash; an unchanged payload writes no row
- [x] Payload canonicalized before hashing — key sort plus `volatilePayloadPaths`
      stripped — while the payload is still stored verbatim
- [x] `IngestionRun` records source, counts, status, and errors
- [x] Only `fetched` / `unchanged` / `failed` are populated at this stage; the other
      counters stay `0` until the pipeline stages that own them exist
- [x] `RUNNING` concurrency guard plus the stale-run reaper (A5)
- Verify: running the fixture source twice yields one run row per execution and no
  duplicate raw documents; a payload differing only in a volatile field writes no row.
- Verified 2026-08-22: `modules/ingestion/` — `raw-ingestion.service.ts`,
  `payload-canonicalization.ts`, `stale-run-reaper.service.ts`,
  `ingestion.module.ts`. **The raw stage only**: normalize, dedupe, classify and
  score are M5.4's orchestration and are not pre-empted here.
  - Checked by hand against the seeded database with the app booted, not only in
    tests: two consecutive runs of `fixture-board` returned `stored=8, unchanged=0`
    then `stored=0, unchanged=8`, leaving **2 `IngestionRun` rows, 8
    `RawJobDocument` rows and 8 distinct `externalId`s**, both runs `SUCCESS`, with
    `created` / `updated` / `duplicates` all `0`. The rows that check created were
    deleted afterwards.
  - **Canonicalization is for hashing only; the payload is stored verbatim.** Keys
    are sorted at every depth (array order is data, not formatting) and
    `volatilePayloadPaths` are stripped, so a posting the source restamps on every
    response hashes identically and writes no row. An e2e case asserts the stored
    document **still contains** `fetchedAt`: a recompute migration
    (`DATABASE.md` §6) reads these rows, so anything stripped at write time would be
    gone for good.
  - `fetched` counts items the adapter yielded, `unchanged` those whose canonical
    hash already had a row, `failed` item-level failures; new rows are the
    remainder. The other three counters belong to stages that do not exist yet and
    stay at their defaults rather than being guessed at.
  - **The stale-run reaper ships with the guard rather than with M5.6, and that is
    load-bearing** (A5). A process killed mid-run leaves a `RUNNING` row with no
    process behind it; the guard would read that as "already in progress" and refuse
    to start ever again, so the source would silently stop ingesting with nothing
    erroring. `ingestSource` reaps before it checks. The threshold is one hour,
    generous on purpose: reaping a merely-slow run would let a second run start
    alongside it, the exact condition the guard exists to prevent.
  - **Known limitation, deliberate and recorded in the code.** The guard's
    count-then-insert shares a transaction, which stops two runs inside one process
    but **does not close the race between two processes** under READ COMMITTED.
    Closing it properly needs a partial unique index
    (`... ON "IngestionRun"("sourceId") WHERE status = 'RUNNING'`), which is a
    migration, and M2 is closed. Until ingestion is scheduled across more than one
    process (M5.5) the transaction is sufficient, and the reaper bounds the damage
    either way.
  - A run-level failure still persists everything stored up to that point, and the
    recorded counts describe what actually happened rather than what was attempted.
- **Seed alignment.** `prisma/seed-data.ts`'s `fixture-board` row carried
  `accessMethod: PUBLIC_API` and `termsUrl: null`, which now disagrees with the
  adapter descriptor that authoritatively owns those fields (A3) and syncs them on
  every run — leaving the row flip-flopping depending on whether `db:seed` or an
  ingestion ran last. The seed entry was changed to match the descriptor.
- Checks after the change: backend `npm test` 22 suites / 244 tests and
  `npm run test:e2e` 6 suites / 74 tests pass (from 12/84 and 5/59),
  `npm run build` clean, `npm run lint` clean, and every file touched is
  Prettier-clean. `test/ingestion.e2e-spec.ts` scopes its cleanup to the fixture
  source and leaves no rows behind (confirmed: 0 `IngestionRun`, 0
  `RawJobDocument` before and after).

### M5.4 — Ingestion orchestration
- [ ] `IngestionService` runs fetch → raw → normalize → dedupe → classify → score
- [ ] One failing source never aborts another
- [ ] Each stage is a service with typed input and output, unit-testable without a database
- [ ] Seeds come from the ingestion plan resolved in `ARCHITECTURE.md` §6/§14.5:
      `since` from the last successful run minus an overlap window, seeds walked
      sequentially, `limit` from the descriptor defaults
- Sequenced after Phases 6–8 — see the sequencing decision at the top of Phase 5.
- Verify: an integration test shows a deliberately failing adapter leaves the other
  source's run successful.

### M5.5 — Scheduling and manual trigger
- [ ] `@nestjs/schedule` cron; `INGESTION_ENABLED` off by default in development
- [ ] `INGESTION_ENABLED` and `INGESTION_CRON` in config, Joi, `.env.example`
- [ ] Admin-only HTTP trigger for manual runs, behind the role guard
- Verify: e2e — the trigger 403s for `USER` and runs for `ADMIN`; the disabled flag
  schedules nothing.

### M5.6 — Retention job
- [ ] Scheduled cleanup of `RawJobDocument` older than 90 days, in batches
- [ ] Expired `RefreshToken` rows deleted after 30 days
- [ ] `JobPosting` and `Job` deactivated by `lastSeenAt`, never deleted (§8)
- Verify: a unit test with an injected clock — old rows go, recent rows stay, saved
  jobs never dangle.

---

## Phase 6 — Job Normalization

Goal: a source payload becomes a `JobPosting` deterministically. Rules and
dictionaries only, no AI — this runs on every posting on every run.

### M6.1 — Text normalization
- [x] HTML to plain text, preserving paragraph and list breaks
- [x] Whitespace and unicode normalization
- Verify: fixture tests over messy HTML produce stable, readable text.
- Verified 2026-08-22: `modules/normalization/` — `html-to-text.ts`,
  `text-normalization.ts`, `text-normalization.service.ts`,
  `normalization.module.ts`, three fixture pairs under `__fixtures__/`. The text
  stage only; company/location (M6.2), the classification-relevant attributes
  (M6.3) and language detection (M6.4) are not pre-empted here.
  - **The two structures preserved are the two the classifier needs**: a paragraph
    break and a list break. Every `<li>` becomes one `- ` line, consecutive rather
    than paragraph-separated, and the marker sits on the *opening* tag so an item
    keeps its bullet when the source never closes the element — which hand-written
    description HTML does constantly.
  - **A line break in HTML source is whitespace, not structure.** Source
    indentation and hard wrapping collapse before tags become breaks, so an ATS
    that wraps its markup at 80 columns does not produce a shredded description.
    Plain-text descriptions take the other path and keep their breaks, chosen by a
    markup test that deliberately does not match `<jobs@example.com>`.
  - **`<script>` content is dropped, not just its tags.** A posting's JSON-LD block
    routinely disagrees with its body; a fixture carries `"Senior Staff Engineer"`
    in the structured data of a junior posting, and the test asserts that text does
    not reach the output. Reaching the classifier, it would be evidence for a title
    nobody wrote.
  - **Entities are decoded last, after the tags are gone.** Decoding first turns an
    escaped `&lt;jobs@example.com&gt;` in the body into markup the tag pass has
    already walked past, and the address disappears from the description.
  - **Normalization is idempotent and NFKC.** Idempotence is asserted directly:
    the pipeline normalizes at more than one point, and a second pass must not be
    able to change a stored value. NFKC rather than NFC because the classifier's
    strongest evidence is numeric — a full-width `5+` has to reach experience
    extraction as ASCII (§6.4). Soft hyphens, zero-width characters and exotic
    spaces are removed, which is what keeps `JobPosting.contentHash` from changing
    on a posting that did not change.
  - **`htmlToPlainText` is deliberately not idempotent, and the test says why.**
    Converted text can legitimately contain `<...>`, which a second conversion
    would eat. A description is converted exactly once, at the raw-to-posting
    boundary; what must be idempotent — and is asserted to be — is the
    normalization it ends with.
  - Invisible characters appear in the code and the tests only as named code-point
    constants. A literal zero-width space in a source file cannot be reviewed.
  - `NormalizationModule` is intentionally not yet imported by `AppModule`:
    `IngestionModule` imports it at M5.4, which is what the sequencing decision at
    the top of Phase 5 exists to make possible.
- Checks: backend `npm test` 25 suites / 295 tests pass (from 22/244),
  `npm run build` clean, `npm run lint` clean, Prettier clean.
  `npm run test:e2e` 6 suites / 74 tests pass — unchanged by this milestone, which
  touches no route and no table. One earlier e2e run failed in
  `test/ingestion.e2e-spec.ts` at its `wipeFixtureData` cleanup and did not
  reproduce in three consecutive runs afterwards; it is a database-readiness flake,
  not a regression from this work, and it is worth watching.

### M6.2 — Company and location
- [x] `companySlug`: lowercased, legal suffixes stripped (GmbH / Ltd / Inc), punctuation removed
- [x] Location parsing into `location` plus ISO `countryCode`
- Verify: unit tests — "Example GmbH" and "Example Gmbh." produce one slug.
- Verified 2026-08-22: `modules/normalization/` — `company-slug.ts`, `location.ts`,
  the shared `ascii-fold.ts`, and `company-location.service.ts` behind
  `NormalizationModule`. The verify case is asserted directly: `Example GmbH`,
  `Example Gmbh.` and `EXAMPLE gmbh` all slug to `example`. The
  classification-relevant attributes (M6.3) and language detection (M6.4) are not
  pre-empted here.
  - **`companySlug` is a dedup partition key, not a display value or a URL
    segment**, so the rules are written against the two failure modes of §6.3
    rather than against readability. Tier 2 hashes it into `dedupHash` and tier 3
    only compares titles *within* one slug, which makes a **collision** the
    expensive error — two employers folded together hide a real vacancy — and a
    **split** merely a visible duplicate. So nothing but legal forms, punctuation
    and diacritics is removed, and the name's own words are never dropped.
  - **Legal forms are stripped only from the end**, repeatedly, so `GmbH & Co. KG`
    comes off as `kg` → `co` → `gmbh` without a compound entry. An interior or
    leading match is part of the name: `AG Solutions GmbH` → `ag-solutions`,
    `Inc Magazin Verlag` unchanged. A name that is *only* a legal form (`Limited`,
    `GmbH`) keeps it — an empty slug would partition every such company together,
    the exact collision the rule exists to prevent.
  - **Diacritics fold German-style, `ü` → `ue`, not `u`.** The same employer
    arrives three ways — `Müller GmbH` from a German board, `Mueller GmbH` from an
    English aggregator, `Muller GmbH` from an ATS that lost its encoding. A plain
    combining-mark strip would give `muller` and match only the third.
  - **An abbreviation dot and an apostrophe join rather than separate**, so `S.A.`
    becomes `sa` for the token list to recognize and `O'Brien` matches the source
    that wrote `OBrien`. Every other separator, `&` included, is a word boundary.
    A few forms survive dot removal as several tokens (`A/S` → `a s`, `S.à r.l.` →
    `sa rl`, `sp. z o.o.` → `sp z oo`) and are matched as phrases, longest first.
  - **A city is never mapped to a country, deliberately.** `Berlin` alone yields a
    null `countryCode`. A city dictionary would risk a wrong country on exactly the
    ambiguous names this market has (Frankfurt, Cambridge, Birmingham, Berlin
    itself), and `countryCode` is an input to `dedupHash`, where a wrong value
    merges or splits real vacancies. The cost is a false split between
    "Berlin, Germany" and "Berlin"; dedup tier 3 covers that — it matches on
    `companySlug` and title similarity and never reads the country. Nothing covers
    a false merge.
  - **`location` stays a display value**: the source's own spelling and diacritics,
    only whitespace-normalized. Nothing compares it, so folding it would only make
    it worse to read. Country matching runs right-to-left and consumes **one**
    segment, so `Germany, Austria` keeps `Germany` in the display value rather than
    dropping it silently.
  - **Workplace type is not detected here.** `Remote` stays in `location` verbatim
    for M6.3; deciding what remote means in two milestones would put the definition
    in two places.
  - The service spec pins this stage against **both** existing corpora — the
    fixture adapter's payloads and `prisma/seed-data.ts`'s hand-written slugs. A
    disagreement with the seed would mean ingesting a seeded employer created a
    second dedup partition beside the first.
- Checks: backend `npm test` 29 suites / 348 tests pass (from 25/295),
  `npm run test:e2e` 6 suites / 74 tests pass — unchanged by this milestone, which
  touches no route and no table — `npm run build` clean, `npm run lint` clean,
  Prettier clean.

### M6.3 — Classification-relevant attributes
- [x] Workplace type detection (REMOTE / HYBRID / ONSITE)
- [x] Employment type detection, including internship and working-student
- [x] Technology extraction against a curated dictionary into `technologies[]`
- Verify: fixture tests cover each enum value and a "no signal" default.

**Two matchers, not one, and the reason is `c#`.** Workplace and employment type are
prose problems: `phrase-match.ts` folds to ASCII and reduces everything that is not a
letter or digit to a space, so "Full-time (m/w/d)" and "full time" are one string and
phrase boundaries are plain spaces. Applying that to technology names would turn
`c#`, `c++`, `.net` and `node.js` into `c`, `c`, `net` and `node js`, so
`technologies.ts` keeps its own symbol-aware boundaries instead — `java` still does
not match inside `javascript`, and `.net` matches at a sentence start but not inside
`asp.net`.

**Decisions worth recording, because each will look wrong in a spot check:**

- **A structured value from the source wins over the text.** Both detectors take an
  optional `declared` value that the adapter layer has already mapped to the enum;
  text detection is the fallback for sources that publish nothing. The fixture
  payloads carry `workplace` and `employmentType` fields whose values their prose
  never states — fx-001 is HYBRID in a field and silent in its description — and
  discarding the employer's own answer in favour of pattern matching would be
  strictly worse. Passing an already-canonical enum keeps §4.2 intact: normalization
  still knows nothing about any source's response format.
- **Remote evidence plus onsite evidence is HYBRID, not REMOTE.** A posting
  mentioning both is describing a split week even when it never says "hybrid". The
  opposite reading is the damaging one: a candidate who filters for remote and finds
  a job needing three office days has been told something false about where they must
  live. A day count — "2 days per week in the office", "3 Tage vor Ort" — counts as
  the same evidence.
- **`null` is a real answer.** Both columns are nullable so that "not stated" is
  distinguishable from ONSITE / FULL_TIME. Defaulting either one would be a guess
  with a filter attached to it.
- **The narrower employment arrangement wins**, in the order working student →
  internship → contract → part time → full time. This is not arbitrary: a Werkstudent
  posting almost always also says "Teilzeit" because that is what it legally is, and a
  German internship posting says "Vollzeit" for the same reason. Resolving those ties
  toward the broader type would erase the two arrangements that matter most to this
  audience. Known cost: "Vollzeit oder Teilzeit" records as PART_TIME.
- **Negation is checked within a three-token window.** "There is no remote work"
  contains "remote"; "this is not an internship" contains "internship". Every
  occurrence is tested, so a later unnegated mention still counts.
- **The employment enum is not extended.** A German `Ausbildung` has no member and
  detects as `null` rather than being forced into the nearest one (`DATABASE.md`
  §3.6).
- **The technology dictionary is curated and closed.** An open extractor that
  promotes capitalized words produces "We", "Berlin" and "Agile" as permanent facet
  values in a vocabulary nothing cleans up; a missing technology is a visible,
  fixable gap, a junk slug is not. **C** and bare **Go** are deliberately absent —
  neither can be matched without matching prose — so Go is recognized only through
  `golang` and phrases like "Go developer".

**One hazard found and fixed while writing the spec.** The dictionary first emitted
`node-js`, but `prisma/seed-data.ts` already carries the hand-written slug `nodejs` on
a seeded job. Two spellings of one technology do not collide loudly — they partition
the facet, and the GIN containment filter can never bring the two halves back
together. The dictionary now follows the name itself (`nodejs`, `nextjs`, `aspnet`
stay one word; only genuinely multi-word names hyphenate), and `technologies.spec.ts`
pins every seeded and profile slug against `TECHNOLOGY_SLUGS` so the next divergence
fails a test instead of silently splitting a facet.

**Known limitation, not worked around.** The title is classified before the
description, which protects a posting whose title states its own type. A full-time
posting with a silent title and a benefits paragraph mentioning that the company also
takes interns still reads as an internship. Fixing it needs sentence structure, which
normalization does not have and should not grow for this; `declared` is the cheaper
answer wherever a source publishes one.

### M6.4 — Language detection
- [ ] ISO 639-1 `language`, English and German recognized, English as the fallback
- [ ] Drives both the search configuration and the classifier pattern set
- Verify: German fixtures detect `de`; unknown languages fall back to `en`.

### M6.5 — Salary extraction — **REMOVED (D7)**
Salary is excluded from the MVP schema (`DATABASE.md` §3.4), so there is no field to
extract into and no normalization stage to build. Salary text stays inside
`description`, unparsed. Recorded in Part II under Phase F6; note that it cannot be
backfilled past the 90-day raw-document window.

---

## Phase 7 — Deduplication

Goal: one canonical `Job` per real vacancy, biased toward false splits.

### M7.1 — Tier 1: source identity
- [ ] Re-ingesting the same `(sourceId, externalId)` updates instead of inserting
- Verify: an integration test — two runs over identical fixtures leave one posting.

### M7.2 — Tier 2: canonical hash
- [ ] `normalizedTitle`: lowercased, seniority words, `(m/f/d)` markers and punctuation removed
- [ ] `dedupHash = sha256(companySlug | normalizedTitle | countryCode)`, stored alongside `normalizedTitle`
- [ ] A UNIQUE violation is handled as a race and retried as a match, not an error
- Verify: unit tests on hash inputs; a concurrency test exercises the retry path.

### M7.3 — Tier 3: fuzzy match
- [ ] `pg_trgm` title similarity, scoped to one `companySlug`
- [ ] Confirmed by a description similarity check
- [ ] Below the threshold creates a new `Job` — a false split beats a false merge
- Verify: an integration test — near-identical titles merge, genuinely different
  roles at one company stay separate.

### M7.4 — Merge and redirect
- [ ] Canonical values taken from the posting with the richest description
- [ ] Merging sets `mergedIntoJobId` on the loser; the row is retained
- [ ] Search excludes merged jobs; a `SavedJob` pointing at one still resolves
- Verify: an integration test — save a job, merge it, the saved job still loads.

---

## Phase 8 — Junior Classification and Scoring

Goal: the core product value — evidence-based classification, never title-only.

### M8.1 — Experience extraction
- [ ] Ranges parsed in English and German: `0–1`, `0-2`, `3+`, `at least 5 years`,
      `mindestens 3 Jahre`, into `minYears` / `maxYears`
- Verify: a fixture corpus with expected year bounds passes.

### M8.2 — Signal extraction
- [ ] Positive patterns: entry level, recent graduates welcome, no experience
      required, training provided, Berufseinsteiger
- [ ] Negative patterns: `N+ years` where N is 3 or more, senior responsibilities,
      lead a team, team management, extensive production experience
- [ ] Each match emits `{ code, weight, evidence }` with a **verbatim** excerpt
- Verify: unit tests assert the excerpt is present and unmodified.

### M8.3 — Rule-based classifier
- [ ] `JuniorClassifier` interface; `RuleBasedClassifier` always runs
- [ ] Outputs `ENTRY_LEVEL`, `LIKELY_ENTRY_LEVEL`, `AMBIGUOUS`, `EXPERIENCED`, `CLEARLY_EXPERIENCED`
- [ ] Precedence: numeric evidence beats phrase evidence beats title; the title
      never decides alone
- [ ] `classifierVersion` recorded on every result
- Verify: **the adversarial corpus passes** — a "Junior Developer" title with
  `5+ years` in the body classifies as `EXPERIENCED`, and the reverse case is caught.

### M8.4 — Classification persistence
- [ ] `JobClassification` written with `inputHash`, signals, and version
- [ ] Unchanged text skips re-classification (cached by `inputHash`)
- [ ] Exactly one `isCurrent` row per job, denormalized onto `Job`
- Verify: an integration test — re-running on unchanged text writes no new row; a
  changed description creates one and moves `isCurrent`.

### M8.5 — Scoring
- [ ] `ScoringService`: deterministic and pure, `ClassificationResult` to 0–100
- [ ] A band from the `JuniorLevel`, adjusted within the band by signal weights
- [ ] The field is named `juniorScore` / `score` — never `probability`, `chance`,
      `likelihood`, `successRate`, or `matchProbability`
- Verify: unit tests on band boundaries; a naming check confirms no probability
  wording anywhere in the API surface.

### M8.6 — Classification test corpus
- [ ] A corpus of anonymized English and German descriptions with expected outcomes
- [ ] Ambiguous and adversarial cases included
- [ ] Documented as the regression net for the core value proposition
- Verify: the corpus runs in CI and every case passes.

### M8.7 — AI classifier stage (optional, feature-flagged)
- [ ] `AiClassifier` behind `AI_CLASSIFIER_ENABLED`, off by default
- [ ] Runs only on `AMBIGUOUS`, or when title and body disagree
- [ ] Schema-validated structured output using the same `Signal` shape with verbatim
      evidence; free-form prose rejected
- [ ] Results cached by content hash
- Verify: with the flag off, no AI call is made and classification still works.
- Note: open question 3 — whether this ships in v1 is a cost/quality call once M8.6
  gives a rule-based accuracy number. The flag makes either outcome cheap.

---

## Phase 9 — Search and Filtering

Goal: `GET /jobs/search` answers "show me jobs I should realistically consider".

### M9.1 — Full-text search
- [ ] `search.repository.ts` — the only place raw SQL lives
- [ ] Queries select the same text-search configuration the write side used
- [ ] `q` matches title (weight A), company (B), description (C)
- Verify: an integration test finds a German posting with a German query; the
  configuration-mismatch case is covered.

### M9.2 — Filters
- [ ] `technologies[]`, `locations[]`, `countryCode`, `workplaceType[]`,
      `employmentType[]`, `juniorLevel[]`, `minJuniorScore`, `maxYearsRequired`,
      `postedWithinDays`
- [ ] No salary filter — salary is not in the MVP schema at all (D7)
- Verify: integration tests per filter, plus a combined-filter case.

### M9.3 — Sorting and default result set
- [ ] `sort` accepts `relevance`, `juniorScore`, `postedAt`
- [ ] `relevance` blends text rank, junior score, and recency
- [ ] The default excludes `CLEARLY_EXPERIENCED`, and `EXPERIENCED` unless opted in
- Verify: an integration test shows the default result set omits both bands.

### M9.4 — Pagination and validation
- [ ] Offset pagination, `pageSize` at most 50, envelope `{ items, page, pageSize, total }`
- [ ] Unknown query params rejected by `forbidNonWhitelisted`
- Verify: e2e — `pageSize=500` is rejected and an unknown param returns 400.

### M9.5 — Profile-fit ranking
- [ ] Authenticated requests weight by the user's technologies and locations
- [ ] Applied at query time only; the stored score stays user-independent
- [ ] Search remains usable without a token
- Verify: an integration test — the same query ranks differently for two profiles
  while the stored `juniorScore` is unchanged.

---

## Phase 10 — Saved Jobs

Goal: a user can keep jobs and come back to them.

### M10.1 — Saved jobs API
- [ ] `GET /saved-jobs`, `POST /saved-jobs`, `DELETE /saved-jobs/:jobId`
- [ ] Unique per `(userId, jobId)`; saving twice is idempotent
- [ ] A user can only reach their own saved jobs
- Verify: e2e — save, list, save again with no duplicate, delete, list empty; user B
  cannot delete user A's saved job.

### M10.2 — Saved jobs survive the pipeline
- [ ] A saved job whose `Job` was merged resolves through `mergedIntoJobId`
- [ ] A saved job whose `Job` went inactive still loads, flagged as inactive
- Verify: an integration test covers both cases (extends M7.4).

---

## Phase 11 — Angular Frontend

Goal: the product is usable in a browser.

### M11.1 — Workspace scaffold
- [x] Angular 22 workspace in `frontend/`, standalone components, SCSS
- [x] `provideRouter` wired in `app.config.ts`
- [x] Vitest via `@angular/build:unit-test`
- Verify: `npm start` in `frontend/` serves the app; `npm test` runs.

### M11.2 — Application shell
- [ ] Replace the default welcome page with a real shell (header, nav, router outlet)
- [ ] Route table with lazy `loadComponent` / `loadChildren` for every feature
- [ ] Global styles: tokens, spacing, typography
- Verify: navigating between two lazy routes loads separate chunks.

### M11.3 — Core layer
- [ ] `core/models` — API contract interfaces mirroring the response DTOs
- [ ] `core/api` — typed HTTP clients for jobs, profiles, saved jobs, auth
- [ ] `core/interceptors` — attach the access token, normalize errors, refresh once on 401
- [ ] `core/auth` — signal-based `AuthService` plus an auth guard
- Verify: Vitest covers token attachment, the refresh-on-401 path, and search
  filter serialization.

### M11.4 — Auth screens
- [ ] Login and register forms with validation and server-error display
- [ ] Redirect to the intended route after login; the guard protects private routes
- Verify: component tests on validation; a manual register → login → search flow.

### M11.5 — Shared components
- [ ] `junior-score-badge` — labelled **"Junior Match"**, never a bare percentage
- [ ] `signal-list` — positive signals and potential concerns with their evidence
- [ ] `job-card` composing both; `ui/` primitives (button, input, chip, empty-state, spinner)
- Verify: component tests assert the score never renders without its evidence and
  that the label is correct.

### M11.6 — Search page
- [ ] Query input, filter panel, result list, pagination
- [ ] Filters mirrored into URL query params, so a search is shareable and survives reload
- [ ] Loading, empty, and error states
- Verify: reloading a filtered URL restores the same result set.

### M11.7 — Job detail page
- [ ] Full description and metadata — no salary display (D7)
- [ ] Classification explanation: level, score, positive signals, concerns
- [ ] Links out to every original posting ("also listed on N sources")
- Verify: a seeded job renders its evidence; the outbound link opens the source.

### M11.8 — Saved jobs page
- [ ] List, unsave, empty state
- [ ] Save and unsave from the job card and the detail page, with optimistic UI
- Verify: saving from search reflects immediately on the saved-jobs page.

### M11.9 — Profile page
- [ ] Edit titles, locations, technologies, workplace types, max years
- [ ] The profile feeds default search filters and profile-fit ranking
- Verify: saving a profile changes the default search result ordering.

---

## Phase 12 — Integration and Testing

Goal: prove the whole thing works together, not just in units.

### M12.1 — End-to-end pipeline test
- [ ] Fixture source → ingestion → normalized → deduped → classified → scored →
      searchable → openable → savable, in one automated run
- Verify: a single integration suite executes the whole chain against a test database.

### M12.2 — Source selection and first live adapter
- [ ] Per `ARCHITECTURE.md` §7.5: review the terms and `robots.txt`, identify the
      permitted access method, record the finding, confirm full description bodies
- [ ] Implement the adapter with its compliance header comment
- [ ] Unit tests run against recorded fixtures — never live HTTP
- Verify: the run ingests real postings and the compliance record is committed.
- Note: open question 1. This is the only MVP milestone blocked on a decision
  outside engineering. Everything else ships without it.

### M12.3 — Tuning against real data
- [ ] Tune the `pg_trgm` threshold (open question 2) against ingested postings
- [ ] Measure rule-based classifier accuracy on the M8.6 corpus
- [ ] Decide M8.7 (the AI stage) on that measurement
- Verify: the chosen threshold and the accuracy number are recorded in the repository.

### M12.4 — Test coverage of the priority areas
- [ ] The `CLAUDE.md` priority list is covered: auth, normalization, deduplication,
      experience extraction, classification, scoring, API validation
- [ ] Frontend: `core/auth`, interceptors, api clients, score badge, signal list
- Verify: `npm test` passes in both projects and no priority area is untested.

### M12.5 — CI
- [ ] Pipeline: install, lint, build, test for `backend/` and `frontend/`
- [ ] PostgreSQL service container for the integration tests
- Verify: a pull request runs the full pipeline green.

---

## Phase 13 — MVP Release

Goal: the product is deployed, observable, and honest about what it claims.

### M13.1 — Production configuration
- [ ] Every variable validated at boot; the app refuses to start when one is missing
- [ ] Secrets come from the environment only — nothing hard-coded, `.env` never committed
- [ ] CORS locked to the production frontend origin; rate limits set
- Verify: booting with an incomplete environment fails loudly with a clear message.

### M13.2 — Deployment
- [ ] Backend deployed with migrations applied on release
- [ ] Frontend built and served, pointed at the production API
- [ ] Managed PostgreSQL with backups
- Verify: `/api/v1/health` is green in production and the frontend completes a search.

### M13.3 — Operational readiness
- [ ] Structured logs with request ids reaching a searchable destination
- [ ] Ingestion runs visible: counts, failures, per-source status
- [ ] Retention and cleanup jobs scheduled and verified once in production
- Verify: a deliberate error is findable in the logs by its request id.

### M13.4 — Product review before launch
- [ ] The score is labelled "Junior Match" everywhere and always shown with its evidence
- [ ] No copy anywhere presents the score as a hiring probability or chance
- [ ] Every job links out to its original posting
- [ ] Source attribution and compliance records complete for every live adapter
- Verify: a walkthrough of every screen against `ARCHITECTURE.md` §6.5 and §7.4.

### M13.5 — MVP acceptance
- [ ] The `PRODUCT.md` §4 flow works end to end: register → profile → search →
      filter → understand the classification → open the original → save
- [ ] The §7 example result renders with real ingested data
- [ ] No MVP boundary from `PRODUCT.md` §9 has been crossed
- Verify: a manual acceptance pass over the ten steps of §4, recorded.

---

# Part II — Future SaaS Phase (post-MVP)

> **Not part of the MVP. Do not implement any of this during Part I.**
>
> `PRODUCT.md` §9 excludes these from the MVP and `CLAUDE.md` forbids building
> future features unless explicitly requested. This section exists so today's
> decisions stay compatible with tomorrow's — it is not a work queue. Every item
> stays unchecked until the MVP is validated **and** the item is explicitly
> requested as its own project.
>
> Prerequisite for all of it: **M13.5 complete and the MVP validated with real users.**

## Phase F1 — Personalization and Alerts
- [ ] Job alerts — a scheduled job reusing the search path over a saved `Profile` query
- [ ] Daily recommendations and a digest email
- [ ] Deeper personalized matching on top of query-time profile-fit ranking
- [ ] Notification preferences and unsubscribe handling

## Phase F2 — Career Assistance
- [ ] `CvDocument` attached to `User`; CV upload and parsing
- [ ] CV-to-job matching against `Job.technologies[]` and stored classification evidence
- [ ] Skill-gap analysis
- [ ] CV improvement suggestions
- [ ] Cover-letter assistance
- [ ] Interview preparation

## Phase F3 — Application Tracking
- [ ] `Application` model referencing `Job` — `SavedJob` is its precursor
- [ ] Status pipeline and history
- [ ] Reminders and follow-ups

## Phase F4 — Subscriptions and Billing
- [ ] `User.plan` field and a billing module
- [ ] Payment provider integration
- [ ] Entitlement checks as a guard, alongside the existing role guard
- [ ] Usage limits per plan

## Phase F5 — Multi-Sided Platform
- [ ] Recruiter accounts (adding the tenant dimension deliberately deferred in the MVP)
- [ ] Company dashboards and a `Company` entity extracted from `companySlug`
- [ ] Administrative UI (explicitly out of scope for the MVP per D4)

## Phase F6 — Scale
- [ ] Extract `ingestion` into a queue-backed worker process
- [ ] Swap PostgreSQL FTS for a search engine (confined to `search.repository.ts`)
- [ ] Caching layer and read replicas
- [ ] Salary capture, display, and filtering (excluded from the MVP by D7) — columns,
      a normalization stage, then currency/period comparison. Historically lossy:
      postings older than the 90-day raw-document window cannot be backfilled
- [ ] Company entities, job taxonomy, application tracking (also excluded by D7)
- [ ] Mobile application

Splitting the monolith waits for a specific measured pressure. The module
boundaries of `ARCHITECTURE.md` §4.3 are the seams along which it would split.
