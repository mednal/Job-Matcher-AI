# JuniorJob AI — Development Milestones

Status: living document
Scope: MVP roadmap (Part I) + recorded post-MVP direction (Part II)
Sources: `CLAUDE.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`

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
| Product / architecture / database design | Written (`PRODUCT.md`, `ARCHITECTURE.md`, `DATABASE.md`) |
| Angular workspace | Scaffolded only — default welcome page, no routes, no app code |
| NestJS backend | Config, validation pipe, CORS, `/api/v1/health` (now `@Public()`), plus a working `AuthModule` and `UsersModule`: register, login, argon2id hashing, JWT access tokens, refresh-token rotation/revocation, logout, a global `JwtAuthGuard`, and `GET /users/me`. `RolesGuard` (M3.5) and `/profiles/me` (rest of M3.6) are not built. |
| PostgreSQL / Prisma | Postgres 18 runs in Docker on host port 5433. `prisma/schema.prisma` now holds `User`, `Profile`, `RefreshToken`, `UserRole`, `WorkplaceType` (M2.2's slice, migration `20260821171157_add_user_auth_tables`). No other tables exist yet — those start at M2.3. |
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
- [ ] `JobSource`, `IngestionRun`, `RawJobDocument` (§3.2)
- [ ] `RawJobDocument` keyed by content hash, so an unchanged re-fetch writes no row
- Verify: inserting the same payload twice produces one row.

### M2.4 — Job tables
- [ ] `JobPosting` and `Job` with structured salary fields (§3.3, §3.4)
- [ ] `@@unique([sourceId, externalId])` on `JobPosting`
- [ ] `Job.dedupHash` UNIQUE; `Job.mergedIntoJobId` self-relation
- [ ] Non-null `language`; `technologies` as `String[]`
- Verify: a second `Job` with the same `dedupHash` is rejected by the database.

### M2.5 — Classification and saved-job tables
- [ ] `JobClassification`, `SavedJob`, and the enums of §3.6
- [ ] Denormalized `juniorLevel`, `juniorScore`, `requiredMinYears`, `requiredMaxYears` on `Job`
- [ ] Partial unique index: exactly one `isCurrent` classification per job
- Verify: inserting a second `isCurrent = true` row for one job fails.

### M2.6 — Raw SQL migration
- [ ] `pg_trgm` extension enabled
- [ ] Language-aware generated `tsvector` column on `Job` plus its GIN index (§5)
- [ ] GIN index on `technologies`; CHECK constraints from §5
- [ ] Index inventory of §7 created
- Verify: `EXPLAIN` on a full-text query uses the GIN index, not a sequential scan.

### M2.7 — Seed script
- [ ] Seed creates a demo user and a fixture job set with classifications
- [ ] Fixtures include English and German postings, and the adversarial case
      ("Junior" title, `5+ years` in the body)
- [ ] Idempotent — re-running does not duplicate rows
- Verify: seeding twice leaves identical row counts.

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
- [ ] `RolesGuard` reading `User.role`, guarding admin-only routes
- [ ] No admin UI and no role-management endpoint (per D4)
- Verify: a `USER` token receives 403 on an `ADMIN` route.

### M3.6 — Users and profile
- [x] `GET /users/me`
- [ ] `GET /profiles/me` and `PUT /profiles/me` (titles, locations, technologies,
      workplace types, max years)
- [ ] A user can only read or write their own profile
- Verify: e2e — user A cannot reach user B's profile.
- Note 2026-08-21: only `GET /users/me` is implemented (`modules/users/`),
  returning a hand-written `UserResponse` DTO that structurally excludes
  `passwordHash`. `/profiles/me` was not requested and needs the `Profile` table's
  write path designed — this milestone stays open until that lands.

---

## Phase 4 — Job Read Model

Goal: the read side serves jobs from the database, before any ingestion exists.

### M4.1 — Jobs module
- [ ] `GET /jobs/:id` — canonical job detail
- [ ] Response DTO includes classification evidence and every source URL
- [ ] `mergedIntoJobId` resolves through a redirect rather than returning a dead job
- [ ] Prisma types never leave the service
- Verify: e2e against seeded data returns the detail; a merged job resolves.

### M4.2 — Job list contract
- [ ] Paginated envelope `{ items, page, pageSize, total }`, `pageSize` at most 50
- [ ] Inactive and merged jobs excluded
- Verify: an e2e test asserts the envelope and both exclusions.

---

## Phase 5 — Job Ingestion

Goal: an orchestrated pipeline that runs end to end against fixtures, with no
source-specific knowledge outside `sources/`.

### M5.1 — Source adapter abstraction
- [ ] `JobSourceAdapter` interface plus `RawJob` / `SourceFetchParams` types (§6.1)
- [ ] `SOURCE_ADAPTERS` injection token array
- [ ] A `FixtureSourceAdapter` reading local JSON fixtures — the development source
- [ ] Nothing outside `sources/` imports a concrete adapter or a source-specific field
- Verify: a unit test resolves adapters through the token; an import check confirms
  no domain module imports `sources/`.

### M5.2 — Compliance guardrails
- [ ] Adapter header-comment requirement documented in `sources/README.md`
- [ ] Shared HTTP client sending a truthful User-Agent with a contact address
- [ ] Conservative client-side rate limiting and exponential backoff
- [ ] `401`, `403`, `429` and block pages are stop conditions that end the run
- Verify: a unit test shows a 429 ends the run and logs, with no retry storm.

### M5.3 — Raw persistence
- [ ] `RawJobDocument` written with a content hash; an unchanged payload writes no row
- [ ] `IngestionRun` records source, counts, status, and errors
- Verify: running the fixture source twice yields one run row per execution and no
  duplicate raw documents.

### M5.4 — Ingestion orchestration
- [ ] `IngestionService` runs fetch → raw → normalize → dedupe → classify → score
- [ ] One failing source never aborts another
- [ ] Each stage is a service with typed input and output, unit-testable without a database
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
- [ ] HTML to plain text, preserving paragraph and list breaks
- [ ] Whitespace and unicode normalization
- Verify: fixture tests over messy HTML produce stable, readable text.

### M6.2 — Company and location
- [ ] `companySlug`: lowercased, legal suffixes stripped (GmbH / Ltd / Inc), punctuation removed
- [ ] Location parsing into `location` plus ISO `countryCode`
- Verify: unit tests — "Example GmbH" and "Example Gmbh." produce one slug.

### M6.3 — Classification-relevant attributes
- [ ] Workplace type detection (REMOTE / HYBRID / ONSITE)
- [ ] Employment type detection, including internship and working-student
- [ ] Technology extraction against a curated dictionary into `technologies[]`
- Verify: fixture tests cover each enum value and a "no signal" default.

### M6.4 — Language detection
- [ ] ISO 639-1 `language`, English and German recognized, English as the fallback
- [ ] Drives both the search configuration and the classifier pattern set
- Verify: German fixtures detect `de`; unknown languages fall back to `en`.

### M6.5 — Salary extraction
- [ ] `salaryMin`, `salaryMax`, `salaryCurrency`, `salaryPeriod`, verbatim `salaryText`
- [ ] Partial extraction is acceptable; stored and displayed, never filtered on
- Verify: fixture tests over ranges, single values, and unparseable text.

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
- [ ] Salary is not filterable in the MVP (D7)
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
- [ ] Full description, salary display, metadata
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
- [ ] Salary filtering and comparison — only currency/period normalization and an
      index are missing
- [ ] Mobile application

Splitting the monolith waits for a specific measured pressure. The module
boundaries of `ARCHITECTURE.md` §4.3 are the seams along which it would split.
