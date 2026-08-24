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
| Source adapter architecture | Designed and approved 2026-08-21 (`ARCHITECTURE.md` §6.1, Phase 5 decisions A1–A7). **M5.1–M5.3 implemented 2026-08-22**: `modules/sources/` holds the `JobSourceAdapter` contract, the `SOURCE_ADAPTERS` token, `SourceRegistryService` (descriptors validated at construction, so an invalid or duplicated one aborts boot), the `PaginatedSourceAdapter` base that owns pagination, the `SourceError` hierarchy, the shared `SourceHttpClient` (truthful User-Agent, per-source rate limiting, 5xx/network-only retries, 401/403/429 and block pages as stop conditions), the `describeAdapterContract` conformance suite, and `FixtureSourceAdapter`; `modules/ingestion/` holds M5.3's raw stage — content-hashed `RawJobDocument` writes, canonicalization with `volatilePayloadPaths`, `IngestionRun` bookkeeping, the `RUNNING` guard and the stale-run reaper. `sources.imports.spec.ts` enforces the §4.2 and §7.3 boundaries mechanically. **M5.4 implemented 2026-08-23**, closing the sequencing decision: `JobSourceAdapter` gained `toRawFields`, the payload-to-shared-vocabulary mapping that §4.2 allows only an adapter to perform; `ingestion-plan.ts` holds §6's seeds; `IngestionService` resolves the plan and isolates one source's failure from the next; `JobPipelineService` chains normalize → dedupe → classify → score for one posting; and `RawIngestionService` gained the seed walk and the `JOB_PIPELINE` seam. M5.5–M5.6 follow it. `docs/SOURCES.md` still records **no reviewed sources** — the fixture adapter is not one, and the register now says so explicitly |
| Angular workspace | **Phase 11 in progress, M11.1–M11.6 done.** M11.2 replaced the welcome page with a shell (header, nav, router outlet, footer carrying the "not a prediction of getting hired" line) over a lazy route table, with the design tokens as CSS custom properties on `:root`. M11.3 built `core/` — API models, four typed clients, the token-attaching interceptor with a single shared refresh-on-401, `AuthService` and the auth guard. M11.4 added the login and register screens, a sanitized `redirectTo`, and a session-aware header. **M11.5 adds `shared/`**: five `ui/` primitives applied as attributes to native elements, `junior-score-badge`, `signal-list` and the `job-card` that composes them. §6.5's rule is structural rather than a convention — the badge shows the number only when the caller states its evidence is on the page, and `job-card` derives that from the signals it was given rather than trusting anyone; the search list, whose `JobSummary` carries no signals, therefore shows the `JuniorLevel` band, which is what §6.5 prescribes. `score-naming.spec.ts` is now mirrored on the frontend over `.ts` and `.html`, and `signal-labels.spec.ts` reads the backend's `SIGNAL_WEIGHTS` so the two vocabularies cannot drift. **M11.6 adds the search page 2026-08-24**: `features/search/` — the query box, the collapsible filter panel, the result list and previous/next pagination, with `search-query-params.ts` as the whole of the URL mapping. The address bar holds the search and nothing else does: the route's params are parsed into a `SearchQuery`, `rxResource` derives the request from it, and every control navigates rather than setting local state, so a reload and a shared link run the same path a fresh visit runs. Parsing drops an unusable parameter instead of the URL around it, never writes a value the API already defaults to, and never truncates a country code. The panel is a draft over that truth — it neither calls the API nor navigates — and `sort` stays the page's, so applying a filter cannot reset an ordering. M11.7–M11.9 are the remaining pages. 231 tests across 24 suites |
| NestJS backend | Config, validation pipe, CORS, `/api/v1/health` (now `@Public()`), plus a working `AuthModule` and `UsersModule`: register, login, argon2id hashing, JWT access tokens, refresh-token rotation/revocation, logout, a global `JwtAuthGuard`, and `GET /users/me`. M3.5/M3.6 close Phase 3: a second global `RolesGuard` with a `@Roles()` decorator (metadata opt-in, role read from the database rather than the token so a demotion takes effect immediately) and a `ProfilesModule` serving `GET`/`PUT /profiles/me` (`PUT` replaces rather than merges; a user who has never saved one gets an empty profile, not a 404; ownership is structural because no route names a profile by id). **Phase 3 is complete.** No admin route exists yet to point `RolesGuard` at — the first is M5.5's ingestion trigger — so its e2e declares a test-only `@Roles(ADMIN)` controller, keeping D4's "no admin surface" intact. M4.1/M4.2 add `JobsModule`: `GET /jobs/:id` (detail with classification evidence, every source URL and its attribution, resolving `mergedIntoJobId` through a redirect) and `GET /jobs` (the `{ items, page, pageSize, total }` envelope, `pageSize` ≤ 50, inactive and merged jobs excluded), both public, plus the shared pagination DTOs in `common/dto/`. **Phase 4 is complete** — the read side serves the seeded jobs, so Phase 11 is unblocked. **M9.1 opens Phase 9**: `SearchModule` serves `GET /jobs/search` (public), with `search.repository.ts` holding the only raw SQL on the read side — a `websearch_to_tsquery` against `Job.searchVector` built through the *same* per-row `CASE` on `language` the generated column was written with, ranked by `ts_rank` over the write-time A/B/C weights and paged in the shared envelope. `textSearchConfiguration` moved from `normalization/language.ts` to `common/utils/` (the `ascii-fold` precedent) so the read side does not import a pipeline module, and a unit test reads M2.6's migration to catch drift. **M9.2 adds the nine filters of §8.1** — `technologies[]` (GIN overlap, so a second chip widens), `locations[]` (case-insensitive substring, ORed, wildcards escaped), `countryCode`, `workplaceType[]`, `employmentType[]`, `juniorLevel[]` (enum `IN` with the cast on the parameters so the level index survives), `minJuniorScore`, `maxYearsRequired` and `postedWithinDays` — each a separate `Prisma.Sql` fragment ANDed onto the structural exclusion, so an unrequested filter contributes no SQL. A `NULL` column is answered two different ways on purpose: `maxYearsRequired` keeps a job that states no minimum (absence of a barrier) while `minJuniorScore` and the enum facets drop one that states nothing (absence of evidence). Comma-splitting is allowed only for slugs and enum members, never for free-text locations. **M9.3 closes the ordering**: `sort` accepts `relevance` (the default), `juniorScore` (`NULLS LAST`, or the highest scores would open with the unscored) and `postedAt`, each ending in M4.2's `effectivePostedAt DESC, id DESC` total order; `relevance` blends text rank, `juniorScore/100` and a 30-day recency half-life at `0.5/0.35/0.15`, tuned in M12.3. `PRODUCT.md` §8's default result set hides `EXPERIENCED` and `CLEARLY_EXPERIENCED`, with naming a level in `juniorLevel[]` as the opt-in and an explicit `IS NULL` branch so an unclassified job is not silently dropped by three-valued logic. **M9.4 closes the envelope and validation**, and fixed a real 500 while doing it: `page` had no upper bound, so `?page=1e20` passed validation (`Number.isInteger(1e20)` is `true`), became an `OFFSET` past PostgreSQL's `bigint` and failed inside the driver — on `/jobs` as well, since both share `PaginationQuery`. `MAX_PAGE = 200` bounds it at 10 000 results deep, and the shared DTO now has its own spec (`common/dto/pagination.query.spec.ts`) rather than being asserted only through whichever endpoint happened to exercise it. **M9.5 closes Phase 9** with query-time profile-fit ranking: `/jobs/search` moved from `@Public()` to a new `@OptionalAuth()` — the guard M4.2 said this would need, since `@Public()` returns before a token is read and left a signed-in caller anonymous — and `relevance` gains a fourth term worth `0.2`, with the other three scaled by `0.8` so an anonymous request is ranked by the identical expression as before. Fit follows the token, not a parameter (§8.1 declares none, so `?profileFit=` is still a 400): technology overlap saturating at three matches, ORed with a binary hit on the profile's free-text `locations` or its `countryCodes`. It ranks and never filters — two profiles get the same jobs and the same `total` in a different order — and the stored `juniorScore` is never written. An empty profile, an anonymous request and an explicit `sort` all skip the profile read entirely. **Phase 9 is complete.** **M10.1 opens Phase 10**: `SavedJobsModule` serves `GET`/`POST /saved-jobs` and `DELETE /saved-jobs/:jobId`, all JWT-only — a collection belongs to an account, so unlike `/jobs/search` there is no anonymous answer. Ownership is structural, as in `profiles/`: every query is keyed by the token's `userId`, no route names a `SavedJob` by its own id, and the row id is not even in the response. Saving is an `upsert` on the `(userId, jobId)` unique with an empty `update`, so idempotency is a database property rather than a racy read-then-write and `createdAt` stays at the first save; deleting is a `deleteMany` scoped by user, so another account's row and one that never existed are the same 404 by construction. `DELETE` returns 404 rather than an idempotent 204 — success for a delete that deleted nothing is a lie the client cannot detect. Merged and deactivated jobs are saved and listed rather than filtered (filtering would unsave them on the user's behalf); resolving the redirect and flagging the inactive one is M10.2. `JobsService` gained `exists()` and exported `JOB_SUMMARY_SELECT`, so `prisma.job` keeps one owner and the saved list renders the same card as search. **M10.2 closes Phase 10**: a saved job outlives what the pipeline later does to the job it names. The list resolves `mergedIntoJobId` at read time through a new `JobsService.findCanonicalSummaries()` — M7.4 deliberately never rewrites a `SavedJob`, so the walk belongs on the read side — and flags a deactivated job with `isActive` rather than hiding it. `jobId` keeps reporting the id that was saved, because it is the row the user owns and the id `DELETE` takes, while `job` carries the survivor's card and `redirectedToJobId` names it; a broken merge chain falls back to the row as stored rather than opening a gap in someone's collection. Only rows that are actually tombstones cost a second query. **Phase 10 is complete** |
| PostgreSQL / Prisma | Postgres 18 runs in Docker on host port 5433. `prisma/schema.prisma` now holds `User`, `Profile`, `RefreshToken`, `UserRole`, `WorkplaceType` (M2.2's slice, migration `20260821171157_add_user_auth_tables`) plus `JobSource`, `IngestionRun`, `RawJobDocument`, `AccessMethod`, `IngestionStatus`, `IngestionTrigger` (M2.3's slice, migration `20260821180642_add_source_ingestion_tables`) plus `JobPosting`, `Job` and `EmploymentType` (M2.4's slice, migration `20260821182202_add_job_tables`) plus `JobClassification`, `SavedJob`, `JuniorLevel` and `Job`'s denormalized classification block (M2.5's slice, migration `20260821184731_add_classification_saved_job_tables`, which also hand-writes the partial unique index enforcing one current classification per job). Every MVP table of `DATABASE.md` §3 now exists. M2.6's slice (migration `20260821190950_add_search_indexes_and_checks`, commit `f3cb483`) adds the raw SQL of §5: the `pg_trgm` extension, the generated `Job.searchVector` column, GIN indexes on `searchVector`, `technologies` and `normalizedTitle` (trigram), the partial `Job_active_search_idx`, and all four CHECK constraints — so §7's index inventory is 25/25 complete. The three GIN indexes are also declared in `schema.prisma` purely to stop Prisma proposing to drop them; see M2.6's fragile-point note before running `prisma migrate dev`. M2.7 closes Phase 2: `prisma/seed.ts` + `prisma/seed-data.ts`, run with `npm run db:seed`, write a demo user, a demo admin, two fixture sources and 10 fixture jobs with one classification each, idempotently. **Phase 2 is complete.** |
| Development fixtures | Seeded (M2.7). 10 jobs covering all five `JuniorLevel` bands, English and German, the adversarial "Junior title / 5+ years body" case, a two-source job, an inactive job and a merged-away job. Hand-written, not classifier output — stamped `classifierVersion = "seed-fixture-1.0"`. This is the corpus Phases 6–8 should be checked against |
| Normalization | **M6.1 implemented 2026-08-22**: `modules/normalization/` holds the text stage — `htmlToPlainText` (markup to plain text preserving paragraph and list breaks, non-prose elements dropped with their content, entities decoded last) and `normalizePlainText` (NFKC, invisible and control characters removed, whitespace and bullet markers folded, idempotent), behind an injectable `TextNormalizationService` with a three-pair fixture corpus. **M6.2 implemented 2026-08-22**: `company-slug.ts` (`toCompanySlug` — German-style ASCII folding so `Müller`/`Mueller`/`Muller` are one slug, joining punctuation deleted, trailing legal forms stripped repeatedly and only at the end, a name that is *only* a legal form kept intact), `location.ts` (`parseLocation` — free text into a display `location` plus an ISO alpha-2 `countryCode` from a curated English/German alias table, with **no city-to-country inference**, since `countryCode` feeds `dedupHash` and tier 3 covers the resulting split while nothing covers a false merge), the shared `ascii-fold.ts` (moved to `common/utils/` by M7.2, which needs the same folding and may not import this module), and `CompanyLocationService` — pinned by spec against both the fixture payloads and the seeded slugs. **M6.3 implemented 2026-08-22**: `phrase-match.ts` (ASCII-folded, token-aligned phrase matching with a three-token negation window), `workplace-type.ts` (REMOTE/HYBRID/ONSITE in English and German, title and location consulted before the description, remote-plus-onsite evidence resolving to HYBRID), `employment-type.ts` (the five-member enum, narrower arrangement winning so a Werkstudent posting is not recorded as PART_TIME), `technologies.ts` (a curated closed dictionary with its own symbol-aware boundaries, so `c#`, `.net` and `node.js` survive matching that `java` inside `javascript` does not), and `JobAttributesService`. Both detectors accept a `declared` value the adapter layer has already mapped to the enum, which wins over the text; `null` stays a real answer for both columns. **M6.4 implemented 2026-08-22**: `language.ts` (`detectLanguage` — stopword-frequency scoring over two deliberately disjoint English/German function-word sets, a supported `declared` code winning outright, English as the fallback for ties, unsupported codes and evidence-free input, and a floor of two German hits so one stray token cannot re-stem a description) plus `textSearchConfiguration`, which mirrors the `CASE` in the `searchVector` generated column by hand and is what M9.1 must build its `tsquery` through. Pinned against all ten seeded jobs and the three M6.1 HTML fixtures. **Phase 6 is complete.** `NormalizationModule` is imported by `IngestionModule` as of M5.4 |
| Deduplication | **M7.1 implemented 2026-08-22**: `modules/deduplication/` holds tier 1 — `PostingIdentityService.upsert` writes one `JobPosting` per `(sourceId, externalId)`, so re-ingestion updates in place. Returns `CREATED` / `UPDATED` / `UNCHANGED` for the run counters, where `UNCHANGED` means no column but `lastSeenAt` would change; `lastSeenAt` is stamped on every call because the M5.6 staleness sweep reads it, `firstSeenAt` never after the insert, and a re-listed posting is reactivated. `postingContentHash` hashes the **normalized** posting over every mutable column (not `RawJobDocument.contentHash`, which hashes the source payload). Tier 1 never assigns or clears `jobId` — that is M7.2/M7.3, and cluster membership must survive re-ingestion. A `P2002` insert race is resolved as a match by re-reading the winner. `DeduplicationModule` is imported by `IngestionModule` as of M5.4, alongside `NormalizationModule`. **M7.2 implemented 2026-08-22**: tier 2 — `normalized-title.ts` (`toNormalizedTitle` — ASCII-folded and lowercased, gender markers removed by a token rule so `(m/w/d)` and `(all genders)` go while `(Java)` stays, punctuation folded to word boundaries, and a deliberately **short** seniority list stripped; word order preserved, and a title that is only seniority words keeps them), `dedup-hash.ts` (`sha256(companySlug|normalizedTitle|countryCode)` in `prisma/seed.ts`'s exact format, pinned against all ten seeded jobs from their raw titles), and `CanonicalJobService.assign`, which attaches a posting to the `Job` carrying its hash — resolving `mergedIntoJobId` to the survivor first — or opens one, treating a `P2002` as a race and retrying it as a match (D1). A posting that is already clustered keeps its cluster; canonical field values are never rewritten on a match, since that is M7.4's. **Read M7.2's RECORDED HAZARD before extending the seniority list**: `dedupHash` is UNIQUE, so a stripped word makes two vacancies unrepresentable. **M7.3 implemented 2026-08-22**: tier 3 — `fuzzy-match.service.ts` (a `$queryRaw` trigram pass, `similarity("normalizedTitle", …) >= 0.75` scoped to one `companySlug`, candidates confirmed by `description-similarity.ts`, a token-set Jaccard at `>= 0.5`) behind the `FuzzyMatcher` seam in `assign`, with the new `FUZZY_MATCHED` outcome. It catches the same vacancy split by `countryCode` and title spelling drift; either gate failing, or a description too thin to carry evidence, opens a new `Job` instead. Both thresholds are still open question 2's conservative guess and M11 tunes them. This is the third place raw SQL is allowed (`DATABASE.md` §5), because Prisma cannot express `similarity()`. **M7.4 implemented 2026-08-22**, closing the phase: `canonical-values.ts` (the pure choice — longest description, ties broken on `firstSeenAt` then `id`, live postings over retired ones, so the answer cannot depend on the order a run fetched them in) behind `CanonicalValuesService.refresh`, which `CanonicalJobService` calls after every attach and on re-ingestion of a clustered posting but never after a create; `job-merge.service.ts` (`merge` — postings moved, the loser retained with `mergedIntoJobId`, existing tombstones re-pointed so chains stay one hop, both ids resolved through their chains first so it is idempotent and never self-redirects); and `merge-chain.ts`, the redirect walk now shared with tier 2 instead of copied. **The cluster's identity is frozen** — `dedupHash`, `normalizedTitle`, `companySlug`, `countryCode` — because `dedupHash` is UNIQUE and derived from three of them. Nothing calls `merge` automatically: it is a correction a human decides on, and D4 keeps the admin surface empty until M5.5. **Phase 7 is complete** |
| Classification | **M8.1 implemented 2026-08-22**: `modules/classification/` holds the experience stage — `experience.ts` (`extractExperience` — six ordered numeric patterns in English and German: ranges, floors (`at least`, `mindestens`, `ab`, `über`, `N+`, `N years or more`), ceilings (`up to`, `maximal`, `less than`) and the bare figure, each claiming its span so a floor is never re-read as an exact value) behind `ExperienceExtractionService`, plus a 25-case fixture corpus. Three rules carry it: a quantity counts only within 40 characters of an experience word (`experience`, `…erfahrung`, `praxis`), searched on both sides, so company blurbs and team sizes do not become requirements; `minYears` is the **highest** floor stated anywhere, so the posting that welcomes "0-2 years" and then demands "5+ years" comes back `5 / null`; and every excerpt is a verbatim slice at its own offset, which M8.2's evidence requirement needs. Both language sets always run — they are disjoint by unit word, and German postings state figures in English. Eight of the ten seeded jobs are pinned to their hand-written bounds; the other two state no figure, and the `Junior QA Engineer` seed's `0 / 1` is phrase evidence (M8.2), asserted as a divergence rather than reverse-engineered. **M8.2 implemented 2026-08-23**: the phrase half — `signal.ts` (the `{ code, weight, evidence }` shape of §5.3 and the one weight table keyed by code, with polarity read off the *sign* so the two stored arrays are a partition of it), `phrase-signals.ts` (a phrase compiler that matches the **original** text so every excerpt keeps an offset: umlauts fold in the pattern, separators are flexible but a line break is not one, `~` opens a word edge for German compounds and `absolvent~`-style inflection, `*` is a gap of up to two words that cannot cross a sentence end; plus a three-word negation guard and the sentence-level excerpt), `signals.ts` (`extractSignals` — the numeric half from M8.1's mentions, at most one signal, leading its list per §6.4's precedence, and the phrase half at one signal per code, earliest occurrence winning) and `SignalExtractionService`. Both language sets always run, extending M8.1's divergence from §6.4's language selection to the phrases, because German ads state English phrases verbatim and `detectLanguage` falls back to `en`. Nothing is emitted without a verbatim excerpt. All 21 codes `seed-data.ts` uses are implemented and the spec asserts the extractor reproduces each seeded job's hand-written code set exactly, with one named addition. **M8.3 implemented 2026-08-23**: the classifier that weighs them — `junior-classifier.ts` (§6.4's `JuniorClassifier` interface, so M8.7's AI stage is an enhancement and never a dependency), `level-rules.ts` (`decideLevel`) and `RuleBasedClassifier` at `rules-1.0`, which runs the experience extractor once and hands its result to the signal extractor. §6.4's precedence is the *structure* of the rules rather than a weighting inside them: a floor of 3+ years settles the posting on the experienced side whatever else it says, failing that a ceiling of ≤2 years settles it on the junior side, failing that the phrase weights band it, and only a still-`AMBIGUOUS` result reads the title — for one step, never to `ENTRY_LEVEL` or `CLEARLY_EXPERIENCED`. The sides are asymmetric on purpose (concerns demote a junior figure as far as `AMBIGUOUS`; positives never rescue an experienced one) and `ENTRY_LEVEL` requires an outright statement rather than a weight total, which is what reproduces all ten seeded fixtures' levels. A 24-case corpus carries the adversarial case in both languages and both directions. **M8.4 implemented 2026-08-23**: `job-classification.service.ts` stores the verdict — `classificationInputHash` (title *and* description, so a renamed job is re-classified) is the cache key, unchanged text writes nothing at all, and standing the previous rows down, upserting and denormalizing onto `Job` are one transaction in that order, because the partial unique index rejects a second `isCurrent` row. **M8.5 implemented 2026-08-23**: `modules/scoring/` — `score-bands.ts` (`scoreFor`, pure) and `ScoringService`, bound to the `JUNIOR_SCORER` token M8.4 left open. Five bands tile 0–100 with no gap or overlap (`ENTRY_LEVEL` 85–100 down to `CLEARLY_EXPERIENCED` 0–14, the edges read off the ten hand-written seed scores), and the net signal weight positions a posting inside its own band, saturating at ±60 so no pile of evidence can reach a neighbouring band — which is why the number can never contradict the level. `score-naming.spec.ts` enforces §6.5's prohibition mechanically: no `probability`, `chance`, `likelihood` or `success rate` in any identifier or string literal under `src/` or `prisma/`, comments exempted so the warnings explaining the rule can stay. **M8.6 implemented 2026-08-23**: `__fixtures__/regression-corpus.ts` — 23 full-length anonymized English and German postings run end to end through the real module and scorer, asserting the level, both experience bounds, the signals present *and* absent, verbatim excerpts and the score's band, with `docs/CLASSIFICATION-CORPUS.md` recording what it guarantees and how to change it. **Phase 8 is complete** — M8.7's AI stage is optional and deliberately not implemented; see its entry. `ClassificationModule` is imported by `IngestionModule` as of M5.4 |
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
- [x] `IngestionService` runs fetch → raw → normalize → dedupe → classify → score
- [x] One failing source never aborts another
- [x] Each stage is a service with typed input and output, unit-testable without a database
- [x] Seeds come from the ingestion plan resolved in `ARCHITECTURE.md` §6/§14.5:
      `since` from the last successful run minus an overlap window, seeds walked
      sequentially, `limit` from the descriptor defaults
- Sequenced after Phases 6–8 — see the sequencing decision at the top of Phase 5.
- Verify: an integration test shows a deliberately failing adapter leaves the other
  source's run successful.
- Verified 2026-08-23: `test/ingestion-pipeline.e2e-spec.ts` registers a
  deliberately broken adapter alongside the fixture source through the
  `SOURCE_ADAPTERS` seam; `runAll` records the broken one `FAILED` with no
  `JobPosting` rows and the fixture one `SUCCESS` with `created > 0`. The same
  suite walks the pipeline end to end — raw documents, normalized postings,
  clustered jobs, current classifications with evidence, and the adversarial
  `fx-003` ("Junior Java Developer", 5+ years, team leadership) landing on
  `CLEARLY_EXPERIENCED`. 971 unit tests and 130 e2e tests pass.

**One contract addition was required.** `RawJob.payload` is `unknown` and §4.2 lets
only `sources/` read a source-specific field name, so nothing could turn a payload
into normalization's input. `JobSourceAdapter` therefore gained
`toRawFields(payload): RawJobFields` — the shared vocabulary (title, company,
location, description, declared workplace/employment type, language, postedAt), and
the one method allowed to name a source's own fields. It is a pure function of a
stored payload rather than a property of a fetch, so a future re-normalization can
replay `RawJobDocument` rows without contacting the source (`DATABASE.md` §6); the
conformance suite asserts exactly that. `PaginatedSourceAdapter` declares it
abstract, so a forgotten mapping does not compile.

**Where the work lives.** `ingestion-plan.ts` holds the seeds — ten curated
English/German title queries, plus a per-key override map where a source that takes
no query (the fixture adapter) declares the single empty seed of §6. Keys are
written as literals, since §6.1 lets nothing outside `sources/` name a concrete
adapter. `IngestionService` resolves the plan (`since` from the last **successful**
run's `startedAt` minus one hour, `limit` from `pageSize × maxPages`) and isolates
sources: `runSource` never throws, it returns a `FAILED` summary, which is what lets
`runAll` keep going. `JobPipelineService` is the per-posting chain and decides only
the stage *order*; its spec runs the real (pure) normalizers against fake
persistence, so it needs no database. `RawIngestionService` keeps the run — the
`IngestionRun` row, the concurrency guard, the budget — and gained the seed walk
plus the `JOB_PIPELINE` seam, so with the seam unfilled it still behaves exactly as
M5.3 shipped it.

**Two decisions worth knowing.** The stages run for **every** fetched item, including
one whose payload was byte-identical to the stored copy: `JobPosting` and `Job` are
retired by `lastSeenAt` (M5.6), and skipping the unchanged case would retire every
posting nobody edits. And `IngestionRun.duplicates` counts postings that *joined* an
existing `Job` on this run (tiers 2/3) — not `ALREADY_CLUSTERED`, which would grow
every run until it merely restated `fetched`.

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
  the shared `ascii-fold.ts` (moved to `common/utils/` by M7.2 — see its note), and
  `company-location.service.ts` behind
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
- [x] ISO 639-1 `language`, English and German recognized, English as the fallback
- [x] Drives both the search configuration and the classifier pattern set
- Verify: German fixtures detect `de`; unknown languages fall back to `en`.

**Stopword frequency, not a library.** Two languages with disjoint function words is
the case where counting works: function words are the highest-frequency tokens in any
prose, and they are unaffected by the English technology names that fill German
postings — "Du entwickelst Features in TypeScript mit Angular" is unambiguously German
on `du`/`in`(excluded)/`mit`, while every content word in it is English. A dependency
would buy accuracy on languages this system has no text-search configuration for.

**Decisions worth recording:**

- **The two stopword sets are disjoint, and a test enforces it.** `in`, `an`, `am`,
  `so`, `man`, `war`, `will`, `hat` and `die` are all frequent German words and all
  deliberately absent, because a token both languages use is evidence for neither. The
  scoring counts German first, so a shared token would have silently biased every
  comparison toward `de`.
- **A tie is the fallback, not a coin flip.** English wins ties because the English
  stemmer is the safer wrong answer — it stems less aggressively than the German one,
  so a misfiled posting loses recall rather than gaining false matches.
- **German must also clear a floor of two hits.** A single "der" inside an English
  quotation must not re-stem a whole description; two is the smallest count that
  cannot come from one token, and real German prose clears it in three words.
- **`declared` wins only when it is `en` or `de`.** A posting declaring `fr` still has
  to be stored as one of the two configurations that exist, and its own text is better
  evidence for which than a code naming a third. `de-DE`, `de_AT` and `DE` all reduce
  to `de`.
- **This stage does not ASCII-fold**, unlike every other matcher in the module:
  folding turns `für` into `fuer`, so both spellings are listed instead and umlauts
  survive tokenization intact.

**`textSearchConfiguration()` exists because the mirror is the fragile part.**
`Job.searchVector` is a generated column whose `CASE` picks `german` or `english`
(migration `20260821190950`). A query built with the other configuration matches almost
nothing, and nothing errors. M9.1 must build its `tsquery` through this function, and
its spec pins the mapping against the migration.

**Known limitation, not worked around.** A title carries no function words — "Junior
Softwareentwickler (m/w/d)" has none — so a title-only input falls back to `en`. The
pipeline always has the description by this stage, and `declared` covers the sources
that publish one.

### M6.5 — Salary extraction — **REMOVED (D7)**
Salary is excluded from the MVP schema (`DATABASE.md` §3.4), so there is no field to
extract into and no normalization stage to build. Salary text stays inside
`description`, unparsed. Recorded in Part II under Phase F6; note that it cannot be
backfilled past the 90-day raw-document window.

---

## Phase 7 — Deduplication

Goal: one canonical `Job` per real vacancy, biased toward false splits.

### M7.1 — Tier 1: source identity
- [x] Re-ingesting the same `(sourceId, externalId)` updates instead of inserting
- Verify: an integration test — two runs over identical fixtures leave one posting.
- Verified 2026-08-22: `modules/deduplication/` — `posting-identity.service.ts`,
  `posting-content-hash.ts`, `deduplication.tokens.ts`, `deduplication.module.ts`,
  plus `test/deduplication.e2e-spec.ts` against the real database. The e2e drives the
  **fixture adapter's own payloads** through `PostingIdentityService.upsert` twice:
  8 `CREATED`, then 8 `UNCHANGED` with the same posting ids and 8 rows.

**Tier 1 never touches `jobId`.** Clustering is M7.2/M7.3's job, and a posting that
already belongs to a `Job` keeps that membership through every later run — otherwise
re-ingestion would silently undo a merge, and tier 3 is biased toward splitting
precisely because a merge is expensive to redo. A case pins it: a posting whose title
changed completely comes back still attached to its job.

**`JobPosting.contentHash` is not `RawJobDocument.contentHash`.** That one hashes the
source payload (M5.3); this one hashes the *normalized* posting and answers a
different question — "would writing this row change any column?". It therefore covers
**every mutable column the upsert writes**, not only the fields the classifier reads.
The schema calls the column "skip re-classify when unchanged", and a hash over the
superset still answers that safely: it can re-classify a posting whose URL moved, but
it can never skip one whose description did. The narrower hash fails the other way —
a changed URL would hash equal and the stale value would never be corrected.

**Decisions worth recording:**

- **`lastSeenAt` is written on the `UNCHANGED` path too.** The staleness sweep (M5.6,
  `DATABASE.md` §8) retires postings a source stopped listing. A posting that was
  fetched again *has* been listed, whether or not its text moved, so leaving the
  column stale would eventually retire every posting nobody edits — which is most of
  them. `firstSeenAt` is never rewritten, and a create stamps both from one clock
  reading so they are equal rather than microseconds apart.
- **Re-listing reactivates.** If the row is `isActive = false` and the source sends it
  again, it goes back to active and the outcome is `UPDATED` even when the text is
  identical — a column changed, so `UNCHANGED` would be a lie to the counters.
- **Fields are JSON-encoded before hashing, so `null` and `""` differ**, and joined
  with NUL so content cannot shift across a field boundary (`title "a" + company
  "b|c"` must not hash like `title "a|b" + company "c"`). `technologies` is sorted
  into the hash as the set it is, while the column keeps the extractor's order.
- **A `P2002` on insert is treated as a match, not an error** — the same rule M7.2
  states for `dedupHash`. The winner's row is re-read rather than assumed, since its
  values are what the update is applied on top of. If the conflicting row cannot then
  be read back, that throws: it is not a race this method can resolve, and the
  orchestrator's item-level handler should count it as a failure rather than have the
  posting silently vanish.
- **A blank `externalId` is rejected before any write.** It is the one input tier 1
  cannot work around: every posting of the source would collapse onto a single row
  through the very unique constraint this tier depends on.
- **The module owns its own `DEDUP_CLOCK`.** Reusing `INGESTION_CLOCK` would point
  `deduplication` at `ingestion` and reverse the §4.3 arrow.

**Not wired into a pipeline yet.** `DeduplicationModule` is imported by nothing —
`IngestionModule` takes it at M5.4, together with `NormalizationModule`, which is why
the e2e maps fixture payloads to `NormalizedPosting` with a dumb local helper instead
of calling the M6 services. What is under test here is identity, not normalization.
- Checks after the change: backend `npm test` 37 suites / 471 tests and
  `npm run test:e2e` 7 suites / 81 tests pass (from 35/434 and 6/74),
  `npm run build` clean, `npm run lint` clean, Prettier-clean. The e2e scopes its
  cleanup to the adapter's `fx-` ids and leaves the 11 seeded postings untouched
  (confirmed in the database: 0 `fx-` rows before and after, 11 total, none
  unclustered).

### M7.2 — Tier 2: canonical hash
- [x] `normalizedTitle`: lowercased, seniority words, `(m/f/d)` markers and punctuation removed
- [x] `dedupHash = sha256(companySlug | normalizedTitle | countryCode)`, stored alongside `normalizedTitle`
- [x] A UNIQUE violation is handled as a race and retried as a match, not an error
- Verify: unit tests on hash inputs; a concurrency test exercises the retry path.
- Verified 2026-08-22: `modules/deduplication/` — `normalized-title.ts`,
  `dedup-hash.ts`, `canonical-job.service.ts` and their specs, plus
  `test/deduplication-tier2.e2e-spec.ts` against the real database. Tier 2 is the
  first tier that clusters: `CanonicalJobService.assign` computes the hash, attaches
  the posting to the `Job` that carries it, and opens one when none does.
  - **The hash format matches `prisma/seed.ts` byte for byte** — the literal `|`
    separator, the empty string for a missing country. It was matched rather than
    re-invented: the seeded jobs are the corpus Phases 6–8 are checked against, and
    a different layout would mean an ingested posting quietly opened a second `Job`
    beside its seeded twin instead of joining it. A spec asserts the agreement for
    all ten seeded jobs, and a second one reaches each seeded hash **from the raw
    title alone**, so `toNormalizedTitle` is pinned to the ten hand-written
    `normalizedTitle` values as well.
  - No NUL separator and no JSON encoding, unlike `postingContentHash`: the three
    inputs come from restricted alphabets (`[a-z0-9-]`, `[a-z0-9 ]`, two letters),
    so none of them can contain a `|` and shift content across a field boundary. A
    case pins that reasoning so it fails if an input rule ever widens.
  - **`countryCode` is uppercased and `null` collapses with `''`.** Both mean
    "country unknown"; tier 3 is what separates two same-titled vacancies that
    landed there from different countries.
  - **A posting that already has a `jobId` keeps it**, even when its title now
    hashes differently — the rule tier 1 states, for the reason tier 1 states it.
    The outcome is `ALREADY_CLUSTERED`, and the job is still stamped `lastSeenAt`,
    because the M5.6 sweep retires by that column and a job with a posting in this
    run has been seen.
  - **Tier 2 never rewrites a matched job's canonical values.** Choosing them from
    the posting with the richest description is M7.4; writing them here would let
    the last posting of a run silently win. Only `lastSeenAt` and `isActive` move.
  - **A hash match resolves `mergedIntoJobId` before attaching**, so a posting joins
    the survivor and not a tombstone — search excludes a merged row (D2), so
    attaching there would hide the vacancy while leaving the posting technically
    clustered. The walk mirrors `JobsService` but ends differently: the read side
    404s on a broken chain, while ingestion holds a posting and must put it
    somewhere, so it stops at the last readable row and logs.
  - The `P2002` race is proven twice: in the unit spec against a mock, and in the
    e2e against a **real UNIQUE index** with concurrent `assign` calls — two racing,
    then a burst of eight. A mock can only show the branch is wired; it cannot show
    the constraint fires. Both cases assert exactly one `Job` and every posting
    attached to it.
  - **`ascii-fold.ts` moved from `modules/normalization/` to `common/utils/`.**
    `companySlug` and `normalizedTitle` are both hashed into `dedupHash`, so they
    must fold by identical rules, but `ARCHITECTURE.md` §4.3 forbids `deduplication`
    importing `normalization`. A second copy of the table would have been a silent
    way for the two to drift apart. Four imports were updated; the function is
    unchanged.
  - `test/jest-e2e.json` gained `"testTimeout": 30000`. Adding an eighth
    database-backed suite pushed cold-start `beforeAll` hooks past the 5 s default
    under parallel workers — a flake introduced by this milestone, fixed rather than
    left to timing.

**RECORDED HAZARD — stripping seniority words can merge two real vacancies.**
`dedupHash` is UNIQUE (D1), so once "Junior Java Developer" and "Senior Java
Developer" at one company in one country both normalize to `java developer`, the
schema *cannot* hold them as two canonical jobs: the second posting attaches to the
first one's `Job`. For a product whose entire value is telling entry-level roles
from experienced ones, that is the expensive direction of error — the one §6.3 says
to avoid by preferring a false split.

It is implemented as specified anyway, deliberately: the rule is written into
`ARCHITECTURE.md` §6.3, `DATABASE.md` §6 and this milestone's own checklist, and the
seeded corpus already encodes it (`Junior Backend Developer (Java)` is seeded as
`backend developer java`, `Lead Platform Engineer` as `platform engineer`). An e2e
case named `KNOWN HAZARD` pins the behaviour so it is visible rather than latent.
Changing it is a product decision plus the recompute migration of `DATABASE.md` §6,
not a detail to settle inside the implementation. The mitigation taken meanwhile is
to keep the seniority list **short** — `junior/jr/jnr`, `senior/sr/snr`, `lead`,
`principal`, `staff`, `leitende(r|s)` — and to leave out every word that names the
role rather than its level: `graduate`, `werkstudent`, `praktikant`, `trainee`,
`intern`, `head`, `manager`, and ladder numerals like `Engineer II`. Each word added
is another pair of distinct vacancies the schema can no longer represent.

**Where tier 3 attaches.** M7.3 slots between the failed hash lookup and the create
in `assign`, at a marked seam: an unmatched posting gets one trigram pass within its
`companySlug` before a new `Job` is opened. It was left absent rather than stubbed,
and M7.3 has since filled it behind the `FuzzyMatcher` interface.
- Checks after the change: backend `npm test` 40 suites / 547 tests and
  `npm run test:e2e` 8 suites / 90 tests pass (from 37/471 and 7/81),
  `npm run build` clean, `npm run lint` clean, Prettier-clean. The e2e scopes its
  cleanup to `t2-` external ids and the `tier2-` company slug; the database after
  the run holds the 10 seeded jobs and 11 seeded postings, 0 of either prefix, and
  no unclustered posting.

### M7.3 — Tier 3: fuzzy match
- [x] `pg_trgm` title similarity, scoped to one `companySlug`
- [x] Confirmed by a description similarity check
- [x] Below the threshold creates a new `Job` — a false split beats a false merge
- Verify: an integration test — near-identical titles merge, genuinely different
  roles at one company stay separate.
- Verified 2026-08-22: `modules/deduplication/` — `fuzzy-match.service.ts`,
  `description-similarity.ts` and their specs, plus
  `test/deduplication-tier3.e2e-spec.ts` against the real database. Tier 3 fills
  the seam M7.2 left in `CanonicalJobService.assign`: a posting no `dedupHash`
  matched gets one trigram pass inside its `companySlug`, and the new outcome is
  `FUZZY_MATCHED`.
  - **Two gates, both of which must pass.** `similarity("normalizedTitle", …) >=
    0.75` inside one `companySlug` picks candidates; a **description** check
    confirms one. Either gate failing means a new `Job` — the split-biased default
    of §6.3, and the reason the confirmation exists at all: within one company a
    handful of genuinely different vacancies share almost every title word, and
    `normalizedTitle` has already had the seniority words removed.
  - **What tier 3 actually catches**, in the order it will fire: the same vacancy
    listed with a country on one board and without one on another — `countryCode`
    is a `dedupHash` input and M6.2 refuses to infer a country from a city, so
    byte-identical titles hash differently — and spelling drift in the title
    (`Front End Developer` against `Frontend Developer`). Both are e2e cases.
  - **The description check is a token-set Jaccard, not a trigram similarity.**
    Descriptions are long, so `similarity()` over two of them is expensive and is
    dominated by shared boilerplate character sequences rather than shared
    vocabulary; two listings of one vacancy are usually the same copy with a
    different wrapper, which set overlap reads well. Being pure and synchronous, it
    is pinned by unit tests rather than only by the integration test. Jaccard
    rather than the overlap coefficient (`shared / min(size)`) deliberately: the
    overlap coefficient scores a short generic ad against a long one near 1,
    because the short side is nearly a subset — exactly the false merge to avoid.
  - **"Too thin to confirm" is a third answer, and it splits.** Below 12 distinct
    tokens on either side, `descriptionSimilarity` returns `null` — unknown, not
    `0` — and tier 3 declines the candidate. A handful of tokens can reach any
    score by accident in either direction, and absence of evidence is not evidence
    of a match. An e2e case pins it: two postings with identical titles *and*
    identical two-line descriptions still become two jobs.
  - **Thresholds: 0.75 on the title, 0.5 on the description.** Both are the
    conservative first guess of `ARCHITECTURE.md` §14 open question 2 — still open,
    and M11 tunes them against ingested postings. 0.75 is far above `pg_trgm`'s own
    0.3 default; it admits `front end developer` ~ `frontend developer` (≈0.77) and
    rejects `software developer` ~ `software engineer` (≈0.37), which stay two
    vacancies. 0.5 is a strong bar for a Jaccard over vocabularies, chosen because
    two ads from one company always share their "about us" and benefits blocks; the
    unit corpus measures a reposted vacancy at 0.78 and a different role at the same
    company at 0.17. A unit case asserts both constants stay biased toward
    splitting, so a tuning pass has to state its intent rather than drift downward.
  - **Tier 3 does not memoize.** The matched `Job` keeps the `dedupHash` it was
    created with — `dedupHash` is UNIQUE (D1) and a row can carry only one — so a
    third posting spelled like the second comes back through tier 3 rather than
    hitting tier 2's index. That is one indexed query per unmatched posting, and it
    keeps the hash meaning exactly one thing. The e2e asserts the stored hash is
    still the creator's.
  - **Rows merged away are candidates like any other.** Tier 2's hash lookup finds
    a tombstone and redirects to the survivor, so tier 3 excluding them would split
    a posting off a cluster somebody deliberately merged. `attach` resolves the
    chain, and an e2e case takes a fuzzy match through a tombstone to the survivor.
  - **The `FuzzyMatcher` seam.** `CanonicalJobService` depends on the interface, not
    the class, so `deduplication-tier2.e2e-spec.ts` can keep asserting tier 2 alone
    by injecting a matcher that never matches. Without it, tier 3's thresholds would
    silently decide what a tier-2 test means — and one tier-2 case does change under
    the wired-up system: a same-titled vacancy in another country, which tier 2
    splits and tier 3 re-joins. That case is now named "leaves … to tier 3" and its
    counterpart is asserted in the tier-3 e2e.

**A rule this milestone had to break: raw SQL outside migrations and search.**
`similarity()` is a `pg_trgm` function and the Prisma query API cannot express it,
so the candidate query is a `$queryRaw`. `DATABASE.md` §5 and `ARCHITECTURE.md` §5.4
both stated search was the only exception; both now name this third place and why.
The query binds `companySlug`, the title and the threshold as parameters — nothing
reaches the statement as text.

**`Job_normalizedTitle_trgm_idx` is not what serves this query.** The `%` operator
that would use the GIN index reads `pg_trgm.similarity_threshold`, a **session**
GUC, and a pooled connection is the wrong place to keep a number that decides
whether two vacancies merge; an explicit `similarity() >=` states it in the code
instead. What makes the query affordable is the `companySlug` equality on
`Job(companySlug, normalizedTitle)` — the similarity is then computed over one
company's rows. At the seeded size Postgres seq-scans all 10 rows regardless
(confirmed with `EXPLAIN ANALYZE`), which is correct at that size; the index
inventory's "fuzzy title match" line in `DATABASE.md` §7 describes the trigram index
optimistically and is left as written, since nothing about it is wrong for a future
cross-company pass.

**Still not wired into a pipeline.** `DeduplicationModule` remains imported by
nothing; `IngestionModule` takes it at M5.4 and the M5.4 orchestrator is what will
call tier 1 then `assign`.
- Checks after the change: backend `npm test` 42 suites / 570 tests and
  `npm run test:e2e` 9 suites / 98 tests pass (from 40/547 and 8/90),
  `npm run build` clean, `npm run lint` clean, Prettier-clean on every file this
  milestone touched. The e2e scopes its cleanup to `t3-` external ids and the
  `tier3-` company slugs; the database after the run holds the 10 seeded jobs and
  11 seeded postings, 0 of either prefix, and no unclustered posting.

### M7.4 — Merge and redirect
- [x] Canonical values taken from the posting with the richest description
- [x] Merging sets `mergedIntoJobId` on the loser; the row is retained
- [x] Search excludes merged jobs; a `SavedJob` pointing at one still resolves
- Verify: an integration test — save a job, merge it, the saved job still loads.
- Verified 2026-08-22: `modules/deduplication/` — `canonical-values.ts`,
  `canonical-values.service.ts`, `job-merge.service.ts`, `merge-chain.ts` and their
  specs, plus `test/deduplication-merge.e2e-spec.ts` against the real database. The
  Verify line is one e2e case: a `SavedJob` is written against a job, the job is
  merged away, the save is **not** rewritten, and `GET /jobs/:id` on the old id
  returns the survivor with `redirectedFromJobId` set and both source listings
  attached.
  - **Two halves, deliberately separate classes.** `CanonicalValuesService.refresh`
    decides which posting a cluster displays; `JobMergeService.merge` folds one
    `Job` into another. Merge needs the refresh (the survivor just gained
    postings), but the refresh has a life of its own — it runs on every attach —
    so folding it into the merge would have left the ordinary ingestion path with
    no owner for the question.
  - **The seam M7.2 and M7.3 left is now filled.** `CanonicalJobService` takes a
    `CanonicalValueWriter` and calls it after `attach` and after `touch`, never
    after `create` (the job was just written from that posting and holds no other).
    `ALREADY_CLUSTERED` refreshes too: tier 1 may have rewritten this posting's
    description on the same run, and the incumbent copy can shrink.
  - **"Richest" is a pure function of the rows, not of the run.** Longest
    description first, then `firstSeenAt` ascending so the copy already on display
    keeps winning a tie, then `id` — a total order, so two runs that attach the
    same postings in different orders cannot disagree. Live postings beat retired
    ones; when every posting is retired the whole pool is used again rather than
    blanking a row a user may have saved.
  - **The identity four are frozen: `dedupHash`, `normalizedTitle`, `companySlug`,
    `countryCode`.** `dedupHash` is UNIQUE (D1) and derived from the other three,
    so re-deriving it from a richer posting could produce a value another `Job`
    already holds — unstorable — and would move the row tier 2 finds for the
    original spelling. Two specs pin the written key set. The visible cost is that
    a job opened from a posting with no country keeps `countryCode = null` after
    one that names a country joins it; that direction only makes the country filter
    miss the job, never file it under a country it is not in. `title` therefore
    moves while `normalizedTitle` does not, and they can disagree: the stored
    normalized title is tier 3's match key, not a view of the display title.
  - **`effectivePostedAt` follows `postedAt` only when the chosen posting has one.**
    Falling back to "now" would jump a job to the top of the recency sort because
    its canonical copy changed, which is not new information (§3.3 wants that
    column stable).
  - **The merge writes are one transaction; the refresh after it is not.** A
    half-applied merge would leave postings on a row search excludes and the vacancy
    would vanish from the product entirely. The refresh is idempotent and derived
    from rows every writer can see, so racing writers converge instead of corrupting
    — a lock on the hottest row in ingestion would buy nothing.
  - **What the loser keeps.** Its `dedupHash`, so a later posting of the losing
    spelling is found by tier 2 and follows the redirect onto the survivor rather
    than opening a third job (an e2e case). Its `JobClassification` rows, because
    the partial unique index allows one current classification per job and moving
    them would collide with the survivor's. Its `SavedJob` rows, untouched — that is
    the entire point of D2.
  - **Merging is idempotent and chain-aware.** Both ids are resolved through their
    own merge chains first, so merging into a tombstone lands on the survivor;
    equal ends make the call a no-op (`ALREADY_MERGED`) rather than a self-redirect,
    which would hide a job from search permanently. Tombstones that already pointed
    at the loser are re-pointed at the winner, so a chain stays one hop long instead
    of growing toward `MAX_MERGE_HOPS`. A non-existent id throws: a merge names two
    specific vacancies, and reporting success on a typo would leave the split in
    place with nobody looking at it again.
  - **`resolveCanonicalId` moved to `merge-chain.ts`.** Merge needs the identical
    walk `CanonicalJobService` already had, and two copies of a loop that decides
    where a posting ends up is exactly the kind of thing that drifts. `JobsService`
    keeps its own on purpose: the read side 404s on a broken chain where the write
    side must place the posting somewhere, and `jobs` may not import
    `deduplication` under §4.3.
  - **Nothing calls `merge` automatically.** It is a correction, not a stage: the
    pipeline splits, a human decides two jobs are one. D4 keeps the admin surface
    empty until M5.5, so this ships as a service method with tests and no route.

**A note Phase 8 has to answer.** A refresh can change a job's canonical
`description` — the text the classifier reads — without touching any
`JobClassification` row, so `classifiedAt` can now be older than the description it
supposedly explains. M8.4 owns the re-classification trigger and should key it on
the canonical values moving, not only on `JobPosting.contentHash`.
- Checks after the change: backend `npm test` 45 suites / 601 tests and
  `npm run test:e2e` 10 suites / 109 tests pass (from 42/570 and 9/98),
  `npm run build` clean, `npm run lint` clean, Prettier-clean on every file this
  milestone touched. The e2e scopes its cleanup to `t4-` external ids, the
  `tier4-` company slug and its own `@merge-e2e.invalid` user; the database after
  the run holds the 10 seeded jobs, 11 seeded postings and 2 seeded saved jobs,
  0 rows of either prefix, no test user, and no unclustered posting.

**Phase 7 is complete.** Tiers 1–3 cluster and M7.4 corrects; `DeduplicationModule`
is still imported by nothing — `IngestionModule` takes it at M5.4, which is the
milestone that finally calls tier 1 then `assign` in sequence.

---

## Phase 8 — Junior Classification and Scoring

Goal: the core product value — evidence-based classification, never title-only.

### M8.1 — Experience extraction
- [x] Ranges parsed in English and German: `0–1`, `0-2`, `3+`, `at least 5 years`,
      `mindestens 3 Jahre`, into `minYears` / `maxYears`
- Verify: a fixture corpus with expected year bounds passes.
- Verified 2026-08-22: `modules/classification/` — `experience.ts`
  (`extractExperience`), `experience-extraction.service.ts`,
  `classification.module.ts`, the 25-case corpus in
  `__fixtures__/experience-corpus.ts` and their specs. The `Verify:` line is that
  corpus: every case carries its expected `minYears` / `maxYears`, and most also
  pin the exact verbatim excerpts.
  - **A number alone is never evidence.** Every quantity has to sit within 40
    characters of an experience word (`experience`, `…erfahrung`, `praxis`),
    searched on both sides and cut at the line break, or it is discarded. Without
    that gate "we have been building payments platforms for 15 years" is a 15-year
    requirement, and so are team sizes and notice periods — all written with the
    same digits. Two corpus cases pin the rejection, and the backwards half of the
    window is what German word order needs: "Berufserfahrung von mindestens 4
    Jahren" puts the word first.
  - **Both language pattern sets always run**, which §6.4's "the pattern set is
    selected by `JobPosting.language`" does not say. That rule is right for M8.2's
    phrases — "mehrjährige Berufserfahrung" has no English reading — and wrong
    here: each numeric pattern requires its own unit word (`years` against
    `Jahre`), so the two sets are disjoint and cannot conflict, while German
    postings routinely state the requirement in English. Selecting by language
    would only lose matches; a corpus case is a German posting whose figure is
    written `3+ years of professional experience`.
  - **Patterns are ordered and claim their span**, so "at least 5 years" is read as
    a floor rather than as the exact "5 years" inside it; the bare quantity is last.
    Six forms: range, floor prefix (`at least`, `mindestens`, `ab`, `über`, `more
    than`), `N+`, `N years or more`, ceiling (`up to`, `maximal`, `less than`), and
    the bare figure.
  - **`minYears` is the highest floor stated anywhere in the text.** The posting
    that welcomes "0-2 years" in one paragraph and demands "5+ years" in another is
    the case this product exists to catch, so the strictest requirement is the
    honest reading; a corpus case is exactly that posting and it comes back
    `5 / null`. An open-ended floor also clears any ceiling, and a ceiling below the
    floor is dropped rather than stored — the result can never violate
    `DATABASE.md` §5's `minYears <= maxYears` CHECK, which a spec pins.
  - **Excerpts are verbatim slices of the input**, offsets included: nothing folds,
    lowercases or rewrites the text, because M8.2 requires evidence to be verbatim
    and M8.3 has to show a user why a job was called experienced. A spec re-slices
    every mention at its own offset and compares.
  - **Eight of the ten seeded jobs are pinned to their hand-written bounds.** The
    two exceptions state no figure and must produce none: `Software Engineer`
    ("the number of years on your CV") is seeded `null / null` and agrees, while
    `Junior QA Engineer` is seeded `0 / 1` from "No experience required" — a phrase,
    which is M8.2's evidence, not this stage's. Reading a number there would be
    inventing one, so the divergence is asserted rather than papered over.
  - **`ein`/`eine`/`einem`/`einer` are not numerals here**, though `zwei`–`zehn` and
    `one`–`ten` are: they are the German indefinite article far more often, and
    "seit einem Jahr am Markt" would otherwise be a one-year requirement. Figures
    above 60 are rejected, matching the `yearsOfExperience BETWEEN 0 AND 60` CHECK,
    so both sides of the eventual profile-fit comparison agree on what a plausible
    number of years is.

**A limitation left standing, for M8.3 to weigh.** The context gate removes the
common false positives but not all of them: "our team brings 20 years of experience
to every project" is a company blurb that reads as a 20-year floor. Tightening it
further would need a requirement-vs-description distinction this stage does not
have, and §6.4 already says numeric evidence beats phrase evidence — so a blurb like
that can outvote a genuine "entry level" statement. M8.3 is where that precedence is
implemented and is the right place to decide whether a floor with no supporting
negative phrase should be trusted outright.

**Not wired into a pipeline.** `ClassificationModule` is imported by nothing, like
`NormalizationModule` and `DeduplicationModule` before it; `IngestionModule` takes
all three at M5.4.
- Checks after the change: backend `npm test` 47 suites / 652 tests and
  `npm run test:e2e` 10 suites / 109 tests pass (from 45/601 and 10/109 — this
  milestone adds no database work, so the e2e count is unchanged and was run to
  prove that), `npm run build` clean, `npm run lint` clean, Prettier-clean.

### M8.2 — Signal extraction
- [x] Positive patterns: entry level, recent graduates welcome, no experience
      required, training provided, Berufseinsteiger
- [x] Negative patterns: `N+ years` where N is 3 or more, senior responsibilities,
      lead a team, team management, extensive production experience
- [x] Each match emits `{ code, weight, evidence }` with a **verbatim** excerpt
- Verify: unit tests assert the excerpt is present and unmodified.
- Verified 2026-08-23: `modules/classification/` — `signal.ts` (the `Signal` shape
  and the weight table), `phrase-signals.ts` (the phrase compiler, the negation
  guard, the excerpt and the dictionary), `signals.ts` (`extractSignals`, which
  combines the numeric and phrase halves), `signal-extraction.service.ts`, the
  25-case corpus in `__fixtures__/signal-corpus.ts` and their specs. The `Verify:`
  line is asserted three times over: for every corpus case, for every seeded
  description, and as a property — `expect(description).toContain(signal.evidence)`
  on every signal produced anywhere in the suite.
  - **Matching runs over the original text, not a normalized copy.** That is the
    decision the phrase file is shaped around and the reason
    `normalization/phrase-match.ts` could not be reused even if §4.3 allowed the
    import: it folds and strips its haystack before matching, which destroys every
    offset, and an offset is what a verbatim excerpt is recovered from. The
    tolerance that file gets from folding the haystack, this gets from compiling
    each phrase into a pattern that matches every spelling of itself — `ä` matches
    `ä`, `ae` and `a`, so a lost encoding is still one phrase; separators are
    flexible so `entry level` and `entry-level` are one entry, but a line break is
    not a separator, because M6.1 keeps paragraph breaks and a phrase does not span
    two paragraphs.
  - **Two operators keep the dictionary short.** `~` opens a word edge, so
    `~erfahrung` reaches `Berufserfahrung` and `Praxiserfahrung` without listing
    German compounds and `absolvent~` reaches `Absolventinnen`; the boundary at the
    *phrase* edge still holds, so an excerpt starts and ends on whole words. `*` is
    a gap of **up to two words**, so `no * experience * required` is one entry
    covering "no experience required" and "no professional experience is required".
    Two rather than three deliberately: at three, `lead * team` starts matching "our
    lead engineer and the platform team". A gap word may not contain a full stop, so
    a gap cannot cross a sentence end.
  - **Both language sets always run**, which extends M8.1's divergence from §6.4's
    "the pattern set is selected by `JobPosting.language`" to the phrases — and
    contradicts M8.1's own aside that the rule was right for them. Two things
    changed the answer. German postings mix English constantly, and "This is an
    entry level position" appears in German ads verbatim (a corpus case), so
    selecting would lose real matches. And `detectLanguage` (M6.4) falls back to
    `en` for short or evidence-free text, so a misdetection would switch the German
    set off on exactly the postings that need it. The two vocabularies share no
    word, so running both cannot conflict; the day a phrase is added that reads
    differently in the other language is the day this needs a language gate.
  - **A negator within three words in front of a match kills it.** "This is not an
    entry level role" and "Keine mehrjährige Berufserfahrung nötig" both produce
    nothing, and "We have no on-call rotation" is not on-call duty — three corpus
    cases. Phrases that carry their own negation are unaffected, because their
    negator is inside the match rather than in front of it. The negator list is the
    one `normalization/phrase-match.ts` uses and is deliberately a second copy: that
    one inspects folded tokens, this inspects the original text, and §4.3 forbids
    the import that would share them.
  - **The evidence is the sentence, not the phrase.** Two words quoted out of a
    posting explain nothing, so the excerpt expands to the sentence its match sits
    in, capped at 150 characters either way and cut at a paragraph break. It is
    always a contiguous slice of the input — nothing is folded, joined or
    summarized — which is what `DATABASE.md` §4.1 makes non-negotiable.
  - **One signal per code, and the earliest occurrence wins.** A posting that says
    "training provided" three ways has said one thing; counting it three times would
    let repetition outweigh evidence at M8.5. A corpus case pins it.
  - **No signal is emitted without an excerpt.** A signal with empty evidence would
    still move the score with nothing to show for it. This is why the numeric signal
    is derived from an `ExperienceMention` rather than from the aggregate bounds —
    an aggregate has no offset and therefore nothing to quote.
  - **The numeric half is one signal at most, and it leads its list.** `minYears ≥
    5` is `REQUIRES_5_PLUS_YEARS`, 3–4 is `REQUIRES_3_PLUS_YEARS`, and a ceiling at
    or below two years is the matching `ZERO_TO_ONE` / `ZERO_TO_TWO` /
    `ONE_TO_TWO` / `UP_TO_TWO_YEARS`. A range like "1 to 4 years" produces
    **nothing**: its floor is below the experienced threshold and its ceiling above
    the junior one, so it says only that the employer has not decided, and putting a
    number on a shrug is worse than silence. A ceiling with no floor stays
    `UP_TO_TWO_YEARS` rather than being read as `0-2`, which is a range the posting
    never wrote. It leads the list because §6.4 weighs it first.
  - **The title is not read here.** §6.4 makes the title one input among many and
    M8.3 owns the rule that it never decides alone, so it is that milestone's input.
    Matching phrases in it too would double-count a posting whose title repeats its
    body and hand the title a vote it is not supposed to have.
  - **The weights live in one table keyed by code**, not beside the phrases, because
    M8.5 reads them too and a second copy is how a scorer and an extractor come to
    disagree about what a signal is worth. Polarity is the *sign* of the weight —
    there is no separate field, so the two arrays `JobClassification` stores are a
    partition on the sign and cannot drift out of step with it.
  - **The vocabulary is the seeds' vocabulary, and the seeds are now reproduced.**
    All 21 codes `prisma/seed-data.ts` uses are implemented, and the spec asserts
    that on each of the ten seeded descriptions the extractor finds exactly the codes
    a person wrote by hand — with one named addition: the German junior posting's
    "…strukturierte Einarbeitung mit festem Mentor" is counted once by the seed
    (`TRAINING_PROVIDED`) and twice by the extractor, which also reads the named
    mentor as `MENTORING_OFFERED`. The seed is the terser judgement, not the more
    correct one. Two weights diverge from the seeds on purpose:
    `ZERO_TO_ONE_YEARS` and `ZERO_TO_TWO_YEARS` are equal (the seeds score the wider
    range higher, which cannot be right) and `TRAINING_PROVIDED` is one number
    rather than the seeds' 15 and 10.

**A limitation left standing, for M8.3.** The dictionary is a fixed list and says
nothing about *where* in a posting a phrase sits, so a benefits section that offers
"Weiterbildung" and a requirements section that demands "mehrjährige Berufserfahrung"
arrive as two signals of equal standing. The precedence rule M8.3 implements —
numeric beats phrase — is what stops that from mattering in the case it matters most,
and the corpus case "junior wording in one paragraph, five years in another" is
already there to prove it.

**Not wired into a pipeline.** `ClassificationModule` is still imported by nothing;
`IngestionModule` takes it at M5.4 with `NormalizationModule` and
`DeduplicationModule`.
- Checks after the change: backend `npm test` 50 suites / 724 tests and
  `npm run test:e2e` 10 suites / 109 tests pass (from 47/652 and 10/109 — this
  milestone adds no database work, so the e2e count is unchanged and was run to
  prove that), `npm run build` clean, `npm run lint` clean, Prettier-clean.

### M8.3 — Rule-based classifier
- [x] `JuniorClassifier` interface; `RuleBasedClassifier` always runs
- [x] Outputs `ENTRY_LEVEL`, `LIKELY_ENTRY_LEVEL`, `AMBIGUOUS`, `EXPERIENCED`, `CLEARLY_EXPERIENCED`
- [x] Precedence: numeric evidence beats phrase evidence beats title; the title
      never decides alone
- [x] `classifierVersion` recorded on every result
- Verify: **the adversarial corpus passes** — a "Junior Developer" title with
  `5+ years` in the body classifies as `EXPERIENCED`, and the reverse case is caught.
- Verified 2026-08-23: `modules/classification/` — `junior-classifier.ts` (the
  `JuniorClassifier` interface of §6.4 with `ClassificationInput` /
  `ClassificationResult`), `level-rules.ts` (`decideLevel`, the whole decision),
  `rule-based.classifier.ts` (`RuleBasedClassifier`, `rules-1.0`), the 24-case
  corpus in `__fixtures__/classification-corpus.ts` and their specs. The `Verify:`
  line is the corpus's first six cases, in both languages and in both directions.
  - **Precedence is the structure of `level-rules.ts`, not a weighting inside it.**
    Each kind of evidence gets its turn only when the stronger kind has nothing
    decisive to say: a floor of three years or more settles the posting on the
    experienced side; failing that, a ceiling of two years or less settles it on the
    junior side; failing that the phrase weights band it; and only if all of that
    comes out `AMBIGUOUS` is the title read. A weighted sum with the number worth a
    lot would have been the other way to build this, and it is the wrong one — it
    makes "Junior title, `5+ years`" a matter of how many friendly phrases the ad
    also contains, when the whole point is that no number of them can matter.
  - **The two sides are deliberately asymmetric.** Negative phrases can demote a
    junior *figure* as far as `AMBIGUOUS` — "1-2 years" next to "you will lead a
    small team and own the architecture" is not an entry-level job — but positive
    phrases cannot pull an experienced figure back up at all. The failure this
    product exists to prevent is a junior applying to a job that wants five years;
    the reverse costs a user one scroll. It also follows from M8.1, where the
    aggregate floor is the *highest* stated anywhere: by the time a floor of five
    reaches this file, five years is the strictest thing the posting said.
  - **`ENTRY_LEVEL` needs a statement, not a total.** It is claimed only when the
    posting says outright that it is open to someone with no professional experience
    — `ENTRY_LEVEL_STATED`, `CAREER_STARTER_WELCOME`, `NO_EXPERIENCE_REQUIRED`, or a
    `0-1` range — and everything else that reads as junior (a graduate programme,
    training, mentoring, a `0-2` range) lands on `LIKELY_ENTRY_LEVEL`. That rule,
    not a tuned threshold, is what reproduces all ten seeded fixtures' levels; the
    spec asserts it job by job. `GRADUATES_WELCOME` is deliberately not in the set,
    because an ad can welcome graduates and five-year engineers in one breath.
  - **The title moves one step, from `AMBIGUOUS` only.** It cannot produce
    `ENTRY_LEVEL` or `CLEARLY_EXPERIENCED` from any string, and it is not read at all
    once the body has reached a verdict — asserted over sixteen real titles in both
    languages. A posting with no description is still classified rather than
    rejected, on its title alone, which is exactly the case that can only reach
    `LIKELY_ENTRY_LEVEL` or `EXPERIENCED`.
  - **The figure is not counted twice.** M8.2 emits the numeric requirement as a
    signal like any other, so the classifier excludes those codes from the phrase
    sums via a new `NUMERIC_SIGNAL_CODES` export in `signals.ts` — otherwise the -35
    a `3+ years` floor already carries would combine with one -15 concern and push a
    plain "3+ years" ad a second level down for saying one thing. A spec pins the set
    against the numeric half so a code cannot be added to one and not the other.
  - **A stated divergence from this milestone's own wording.** The `Verify:` line
    says the Junior/`5+ years` posting is `EXPERIENCED`; it comes out
    `CLEARLY_EXPERIENCED`, which is the same finding one level stronger and is what
    the seeded fixture for that exact posting (`vantage-junior-java`) says. Five
    years is the line between the two levels, so the corpus pins
    `CLEARLY_EXPERIENCED` at five and `EXPERIENCED` at three, and a separate
    assertion states the milestone's own claim: every Junior-titled posting that
    demands years stays on the experienced side.

**Not wired into a pipeline.** `ClassificationModule` exports the classifier
alongside both extractors — M8.4 needs the experience bounds for `Job` and M8.6
exercises the stages separately — but is still imported by nothing. `IngestionModule`
takes it at M5.4.
- Checks after the change: backend `npm test` 52 suites / 785 tests and
  `npm run test:e2e` 10 suites / 109 tests pass (from 50/724 and 10/109 — this
  milestone adds no database work, so the e2e count is unchanged and was run to
  prove that), `npm run build` clean, `npm run lint` clean, Prettier-clean.

### M8.4 — Classification persistence
- [x] `JobClassification` written with `inputHash`, signals, and version
- [x] Unchanged text skips re-classification (cached by `inputHash`)
- [x] Exactly one `isCurrent` row per job, denormalized onto `Job`
- Verify: an integration test — re-running on unchanged text writes no new row; a
  changed description creates one and moves `isCurrent`.
- Verified 2026-08-23: `modules/classification/` — `job-classification.service.ts`
  (`JobClassificationService.classifyAndPersist`, the only place a verdict meets the
  database), `classification-input-hash.ts` (the cache key),
  `classification.tokens.ts` (`CLASSIFICATION_CLOCK`, `JUNIOR_SCORER`), their specs,
  and `test/classification-persistence.e2e-spec.ts`, which is the `Verify:` line
  against a real database with the real classifier and only the clock substituted.
  - **The cache key is the classifier's own input, not the posting's content hash.**
    `classificationInputHash` hashes exactly the fields `ClassificationInput` carries
    — title and description — which is what makes it correct rather than merely
    convenient: two calls with an equal hash are calls the classifier cannot tell
    apart, so re-running it is guaranteed to reproduce the stored row. It also
    answers the note M7.4 left this phase. `JobPosting.contentHash` moves when a URL
    moves and does *not* move when M7.4 re-derives a `Job`'s canonical description
    from a different posting, so keying on it would both re-classify for nothing and
    miss the case that matters; keying on the canonical text cannot.
  - **The title is in the hash, which diverges from `prisma/seed.ts`.** The seed
    hashes the description alone. `decideLevel` reads the title, so a job renamed
    from "Senior" to "Junior" over one unchanged description is a different
    classification and must not be answered from the cache — the e2e asserts exactly
    that, `AMBIGUOUS` to `LIKELY_ENTRY_LEVEL` with the body untouched. The seed
    writes under `seed-fixture-1.0` and this service under `rules-1.0`, so the two
    key spaces never meet.
  - **A hit on an already-current row writes nothing at all.** Not the row, not
    `Job`, not `classifiedAt` — which is the point of that column keeping its
    meaning: it is when the verdict was reached, not when a run last looked. The
    other hit is a description that changed and changed back, where the stored row is
    still the right answer, so `isCurrent` moves back onto it and the classifier
    still does not run. Both are `CACHED`; only a miss is `CLASSIFIED`.
  - **Standing down, writing and denormalizing are one transaction, in that order.**
    The partial unique index rejects a second `isCurrent` row, so the previous rows
    have to go down before the insert — the same order the seed uses. A `Job` whose
    denormalized block disagrees with its current row is a silent wrong answer in
    Phase 9's search, so every path that moves `isCurrent` ends in the same
    `denormalize`. The e2e proves the index rather than trusting the service: setting
    a stood-down row back to `isCurrent` by hand fails with `P2002`.
  - **`upsert`, not `create`.** The lookup and the insert are not one atomic step, so
    two runs on one job would race and one would die on the unique key. Re-writing an
    identical row is harmless because the result is a pure function of text both runs
    read.
  - **The score is M8.5's, and this milestone does not invent one.**
    `JobClassification.score` is NOT NULL while §6.5 puts every rule for producing a
    number in the next milestone, so persistence takes it from an optional
    `JUNIOR_SCORER` token that nothing binds yet and writes `0` until M8.5 binds
    `ScoringService`. The alternative — a band table here as well — is exactly how a
    scorer and its store come to disagree. Zero is visibly a placeholder rather than
    a plausible score, and nothing reads the column before M8.5: the pipeline that
    fills the table is M5.4 and the search that filters on it is Phase 9.
  - **`ClassificationModule` now names `PrismaModule` in its imports.** It is
    `@Global()`, so the application never needed the line, but the four specs in this
    folder compile `ClassificationModule` on its own, where a global registered by
    `AppModule` does not exist.

**Not wired into a pipeline.** `ClassificationModule` exports
`JobClassificationService` alongside the classifier and both extractors, and is still
imported by nothing; `IngestionModule` takes it at M5.4, which is the milestone that
calls it once deduplication has decided which `Job` a posting belongs to.
- Checks after the change: backend `npm test` 54 suites / 803 tests and
  `npm run test:e2e` 11 suites / 118 tests pass (from 52/785 and 10/109),
  `npm run build` clean, `npm run lint` clean, Prettier-clean on every file this
  milestone touched. The e2e scopes its cleanup to the `m84-vantage-payments`
  company slug; the database after the run holds the 10 seeded jobs and their 10
  `seed-fixture-1.0` classifications, one current row each, and no `rules-1.0` row.

### M8.5 — Scoring
- [x] `ScoringService`: deterministic and pure, `ClassificationResult` to 0–100
- [x] A band from the `JuniorLevel`, adjusted within the band by signal weights
- [x] The field is named `juniorScore` / `score` — never `probability`, `chance`,
      `likelihood`, `successRate`, or `matchProbability`
- Verify: unit tests on band boundaries; a naming check confirms no probability
  wording anywhere in the API surface.
- Verified 2026-08-23: `modules/scoring/` — the module §4.1 reserved for this, and the
  only one in the pipeline that depends on nothing. `score-bands.ts` (`SCORE_BANDS`,
  `WEIGHT_SATURATION`, `scoreFor` — the whole calculation, pure), `scoring.service.ts`
  (`ScoringService.score`, its injectable face), `scoring.module.ts` and the two
  specs; `ClassificationModule` now binds `JUNIOR_SCORER` to it, which is the seam
  M8.4 left open and the only change that milestone's code needed.
  - **The bands tile 0–100 with no gap and no overlap**: `ENTRY_LEVEL` 85–100,
    `LIKELY_ENTRY_LEVEL` 65–84, `AMBIGUOUS` 40–64, `EXPERIENCED` 15–39,
    `CLEARLY_EXPERIENCED` 0–14. That is what makes "the score never contradicts the
    level" true by construction rather than by tuning — a card showing 78 next to
    "Likely entry level" cannot be a contradiction, and §6.5's fallback (show the band
    where the evidence cannot be shown) stays honest. The spec asserts the tiling, and
    asserts the ordering end to end over every neighbouring pair at both extremes of
    the evidence.
  - **The edges were read off the seeds, not invented.** The ten hand-written M2.7
    classifications sit at 88–94, 72–79, 48, 21 and 2–6 — every one inside the band
    its level now gets, and the spec pins that. Those numbers were written by a person
    before any of this code existed, so agreeing with them is the strongest available
    evidence that the scale matches human judgement rather than having been fitted to
    the classifier. The exact figures are deliberately **not** reproduced: the seeds
    are stamped `seed-fixture-1.0` and this scorer writes `rules-1.0`.
  - **Every signal counts in the adjustment, the numeric one included** — the opposite
    of `phraseWeight` in `level-rules.ts`, and deliberately so. There, excluding the
    figure stopped it deciding the level twice. Here the level is already settled and
    nothing can change it, so the figure is simply the strongest thing the posting
    said about itself: a five-year floor has to rank below a three-year one *inside*
    `CLEARLY_EXPERIENCED`, and it only can if its weight is read.
  - **Saturating, not scaling.** A net weight of ±60 — roughly two strong statements
    in one direction — puts a posting at its band edge, and more evidence moves it no
    further. A linear scale with no ceiling would need clamping anyway; the saturation
    says why the clamp is there. A posting with no signals at all lands mid-band,
    which is the honest answer: the band is what was established, and nothing inside
    it was.
  - **The naming check is a test, not a review rule.** `score-naming.spec.ts` walks
    every `.ts` file in `src/` and `prisma/`, strips comments with a character scanner
    (a regex mistakes `'https://…'` for a line comment and would silently stop
    checking whole files), and fails on `probabilit*`, `chance`, `likelihood` or
    `success rate` in identifiers or string literals. Comments are exempt on purpose:
    four files carry a comment saying the score is *never* a hiring probability, and a
    check that failed on those would teach the next author to delete the warning. The
    spec excludes itself by exact path, since the prohibited words are its subject.
  - **`UNSCORED` stays as the optional default** for the unit specs that construct
    `JobClassificationService` by hand. Nothing resolving `JUNIOR_SCORER` through the
    module can see it any more, and `classification-persistence.e2e-spec.ts` now
    asserts the stored `juniorScore` falls in its level's band instead of being `0`.

### M8.6 — Classification test corpus
- [x] A corpus of anonymized English and German descriptions with expected outcomes
- [x] Ambiguous and adversarial cases included
- [x] Documented as the regression net for the core value proposition
- Verify: the corpus runs in CI and every case passes.
- Verified 2026-08-23: `__fixtures__/regression-corpus.ts` (23 full-length postings),
  `classification-regression.spec.ts` (the runner — 69 case assertions plus 5 about
  the corpus itself) and **`docs/CLASSIFICATION-CORPUS.md`**, which is the "documented
  as the regression net" line: what it guarantees, what it covers, and the rules for
  changing it.
  - **Full postings, not fixtures.** `classification-corpus.ts` (M8.3) is 24 short
    texts each pinning one branch of `decideLevel`; this one is postings with the
    noise real ones carry — benefits paragraphs, tech stacks, a sentence about the
    team — because the failure the product exists to prevent happens where the
    decisive sentence is *buried*, not in a two-line fixture. Both are wanted: a unit
    corpus fails with a message about a rule, this one fails with a message about a
    posting.
  - **Every case is anonymized by construction.** Each description is a paraphrase
    written for this repository — no text copied from a board, every company invented
    — which is what keeps it storable under §7.5, and the doc states it as a
    constraint on every future addition.
  - **A case asserts the whole answer, not just the level**: the level, both
    experience bounds (they back M9.2's `maxYearsRequired`, so a wrong bound hides
    jobs), that every named signal is present, that named `absent` signals are not —
    which is how a case pins against *over*-matching — that every excerpt occurs in
    the posting verbatim, that no code is reported twice, and that the M8.5 score
    lands in its level's band. Nothing is stubbed: the real module, the real
    extractors, the real scorer.
  - **The runner also asserts things about the corpus**, so a later edit cannot
    quietly shrink it to the cases that happen to pass: every level present in both
    languages, adversarial cases in both directions, at least four ambiguous cases,
    and every description a real posting's length.
  - **Ambiguous cases are load-bearing.** Five of the 23 are postings where the honest
    answer is that the employer has not said — a neutral title over a silent body in
    both languages, `1 to 4 years`, a junior figure with a senior job attached to it,
    and an employer that refuses to count years at all. A confident wrong verdict is
    the failure this product must not produce, so these are as protected as the
    adversarial ones.
  - **The corpus was mutation-checked**, not merely run: flipping one expected level
    made the suite fail on that posting by name, which is the only way to know that a
    green corpus is asserting anything.
  - CI is M12.5 and does not exist yet. The suite is plain and unconditional — no
    database, no network, no fixtures on disk — so it runs the moment CI runs
    `npm test`, and the doc records that nothing may make it conditional.

### M8.7 — AI classifier stage (optional, feature-flagged)
- [ ] `AiClassifier` behind `AI_CLASSIFIER_ENABLED`, off by default
- [ ] Runs only on `AMBIGUOUS`, or when title and body disagree
- [ ] Schema-validated structured output using the same `Signal` shape with verbatim
      evidence; free-form prose rejected
- [ ] Results cached by content hash
- Verify: with the flag off, no AI call is made and classification still works.
- Note: open question 3 — whether this ships in v1 is a cost/quality call once M8.6
  gives a rule-based accuracy number. The flag makes either outcome cheap.
- **Deliberately not implemented (2026-08-23).** The milestone is optional and gated
  on that call, and the number it was waiting for now exists: the M8.6 corpus passes
  23/23 with no case needing a second opinion, and the rule-based classifier
  reproduces all ten hand-written seed levels. Nothing in the MVP is blocked on an AI
  stage, `JuniorClassifier` keeps it an enhancement rather than a dependency, and
  `CLAUDE.md` says not to implement future features unless asked. **Phase 8 is closed
  at M8.6**; revisit this at M12.3, which is the first point real postings can say
  whether the rules are enough.

---

## Phase 9 — Search and Filtering

Goal: `GET /jobs/search` answers "show me jobs I should realistically consider".

### M9.1 — Full-text search
- [x] `search.repository.ts` — the only place raw SQL lives
- [x] Queries select the same text-search configuration the write side used
- [x] `q` matches title (weight A), company (B), description (C)
- Verify: an integration test finds a German posting with a German query; the
  configuration-mismatch case is covered.
- Verified 2026-08-23: `modules/search/` (`search.repository.ts`,
  `search.service.ts`, `search.controller.ts`, `dto/search.query.ts`) serving
  `GET /jobs/search`, plus `test/search.e2e-spec.ts` — 17 integration cases
  against the real database.
  - **The configuration is derived per row, in SQL.** The write side's
    `searchVector` is a generated column whose `CASE` picks `german` when
    `language = 'de'` and `english` otherwise, so the query side does the same
    inside `websearch_to_tsquery`. It cannot be a configuration chosen once in
    TypeScript: **one result set spans both languages**, and only the database
    knows which row is which before the query runs.
  - **The mismatch was made expensive to get wrong, twice.** The e2e asserts both
    directions against the column directly — a German posting matches
    `'Bewerbung'` under `german` and matches *nothing* under `english`
    ("Bewerbungen" indexes as `bewerb`); an English one matches `'developing'`
    under `english` and nothing under `german`. That is the failure this design
    exists to prevent: it does not raise, it just returns fewer jobs.
    Mutation-checked — forcing the fragment to `english` failed exactly the two
    German cases and the drift guard, nothing else.
  - **`textSearchConfiguration` moved to `common/utils/`.** M6.4 had put it in
    `normalization/language.ts`, but §4.3 forbids the read side importing a
    pipeline module — the same bind that moved `ascii-fold.ts` in M7.2. It now
    sits beside it, carrying both the TypeScript mapping and
    `TEXT_SEARCH_CONFIGURATION_SQL`; `language.ts` re-exports it, so nothing that
    already imported it changed. A **unit** test reads M2.6's migration file and
    fails if the fragment and the generated column ever diverge, so drift is
    caught before anything reaches Postgres.
  - **`websearch_to_tsquery`, not `to_tsquery`**: it accepts what a user types —
    quoted phrases, `or`, a leading `-` — and never throws on punctuation, so a
    stray `&` is a search and not a 500. A query of only stopwords parses to an
    empty `tsquery` and matches nothing, which is the honest answer; matching
    everything would look like a search that ignores what was typed.
  - **The A/B/C weights are not restated by the query.** `setweight` baked them
    into the vector at write time, so plain `ts_rank` already ranks a title hit
    above a description hit — asserted by relative position, not by score.
    Normalization `32` puts every rank in `[0,1)` so M9.3 can blend it with the
    junior score and recency. The rank orders the page and is **never** in the
    response: it is only comparable within one result set.
  - **`SearchModule` is imported before `JobsModule`** in `AppModule`. Nest
    registers routes in module order and `/jobs/:id` is parsed by
    `ParseUUIDPipe`, which would reject the literal `search` with a 400 and make
    the endpoint unreachable. An e2e case asserts the route is not swallowed.
  - Scope held to M9.1: no filters, no `sort`, no profile-fit. Until M9.2 lands,
    `forbidNonWhitelisted` **rejects** a filter param rather than ignoring it — a
    filter the backend silently drops returns jobs the user excluded.

### M9.2 — Filters
- [x] `technologies[]`, `locations[]`, `countryCode`, `workplaceType[]`,
      `employmentType[]`, `juniorLevel[]`, `minJuniorScore`, `maxYearsRequired`,
      `postedWithinDays`
- [x] No salary filter — salary is not in the MVP schema at all (D7)
- Verify: integration tests per filter, plus a combined-filter case.
- Verified 2026-08-23: all nine parameters on `SearchQuery`, composed into SQL by
  `SearchRepository.filters`, with 18 new `test/search.e2e-spec.ts` cases — one per
  filter, a combined one, and a contradictory one — plus 17 new unit cases across
  `search.query.spec.ts` and `search.service.spec.ts`. 39 unit and 39 e2e cases
  pass in the search module.
  - **A `NULL` column is answered differently by two filters, on purpose.**
    `maxYearsRequired` *keeps* a job stating no minimum — an unstated requirement
    is the absence of a barrier, and dropping those rows would hide most of the
    genuinely junior postings this product exists to surface. `minJuniorScore`
    *drops* an unclassified job — there the absent value is absence of evidence,
    and "at least 70" cannot be answered by a job nothing has scored. The enum
    facets side with the score: a posting that never said it was remote is not an
    answer to `workplaceType=REMOTE`. Both directions are pinned by their own e2e
    case against a deliberately unclassified fixture; mutation-checked by removing
    the `IS NULL` branch, which failed exactly two cases.
  - **`technologies[]` is overlap (`&&`), not containment (`@>`)** — a second chip
    widens the result set, which is how a facet panel reads. Containment would
    make almost every two-technology filter empty; mutation-checked, and it fails
    the widening case. `Job_technologies_idx` (GIN) supports `&&` directly.
  - **Comma-splitting is allowed only where a comma cannot be part of a value.**
    Enum members and technology slugs split, because `?technologies=java,kotlin`
    read as one literal slug returns zero results with nothing to explain why.
    `locations` never splits — "Berlin, Germany" is one place. Enum members are
    also read case-insensitively: the set is closed, so casing carries no
    information and a 400 on `remote` teaches the client nothing.
  - **`%` and `_` in a location are escaped before they reach `ILIKE`.** Unescaped,
    `locations=%` matches every job that has a location — a filter returning *more*
    than it named, which is worse than one returning nothing. Mutation-checked.
  - **The enum casts are on the parameters, not the column.**
    `"Job"."juniorLevel"::text IN (…)` would have forfeited
    `Job_juniorLevel_effectivePostedAt_idx` — the index this filter exists to use —
    so each value is bound and cast individually to its PostgreSQL enum type. The
    type name is the only literal, and it is a constant in the repository.
  - **An empty parameter is not a filter.** `?technologies=` is a user who selected
    no chips; the DTO drops empty entries and the service collapses "absent" and
    "present but empty" into one answer, so it cannot become a predicate no job
    satisfies.
  - **An unknown technology slug narrows to nothing rather than 400ing.** Validating
    against the dictionary would mean the read side importing `normalization/`,
    which §4.3 forbids — the same bind that moved `textSearchConfiguration` in
    M9.1. A facet value that has gone out of use should return no jobs, not break
    the request.
  - Filters can only narrow: the structural exclusion of merged and deactivated
    jobs is a separate fragment ANDed ahead of them, asserted by its own case.
    `sort` (M9.3) and profile-fit (M9.5) are still **rejected** rather than ignored.

### M9.3 — Sorting and default result set
- [x] `sort` accepts `relevance`, `juniorScore`, `postedAt`
- [x] `relevance` blends text rank, junior score, and recency
- [x] The default excludes `CLEARLY_EXPERIENCED`, and `EXPERIENCED` unless opted in
- Verify: an integration test shows the default result set omits both bands.
- Verified 2026-08-23: `SearchSort` on the DTO, `SearchRepository.orderBy` and
  `.relevance`, and the default-band predicate inside `filters`. 17 new e2e cases
  (56 in the suite) and 10 new unit cases (49 in the module); the full backend is
  1027 unit and 186 e2e.
  - **Naming a level in `juniorLevel[]` *is* the opt-in.** §8.1's parameter list is
    closed and this milestone did not invent an `includeExperienced` alongside it.
    An explicit request is answered — a filter the backend *overrides* is the same
    failure as one it ignores — so `juniorLevel=EXPERIENCED` returns those jobs
    and sending no level leaves the product default in force.
  - **`NULL NOT IN (…)` is `NULL`, not `TRUE`.** Written the obvious way, the
    default predicate would have dropped every unclassified job out of the default
    view — silently, and only for jobs the pipeline had not reached. The `IS NULL`
    branch is spelled out and has its own e2e case; mutation-checked by removing
    it, which failed four cases. A job nothing has classified is not *known* to be
    experienced, so it stays.
  - **`NULLS LAST` on the `juniorScore` sort.** PostgreSQL sorts NULLs first under
    `DESC`, so without it "highest junior score first" would have opened with every
    job that has no score at all. Mutation-checked.
  - **The blend's weights are `0.5 / 0.35 / 0.15` (text / suitability / recency),
    with a 30-day recency half-life** — a starting point in the same sense as
    M7.3's trigram thresholds, tuned in M12.3. A weight is not the range a term
    uses, and the difference is recorded in the code: `juniorScore/100` and the
    recency curve genuinely span `[0,1]`, but `ts_rank(…, 32)` does not — measured
    against this schema's `setweight` vector, a one-word title hit ranks `0.378`
    and a description hit `0.108`. So suitability holds the widest range, which is
    right for this product, while the text term can still open a ~`0.14` gap —
    enough to lift a title match over a description match carrying a ~38-point
    score advantage.
  - **Each term has its own e2e case built to isolate it**, because the first
    attempt did not. A pair differing only in age cannot test the recency term at
    all — the relevance tiebreak is `effectivePostedAt DESC` too, so both
    orderings agree by construction. The cases therefore use pairs that disagree:
    one ranks first under `relevance` and last under `juniorScore`/`postedAt`, and
    only the term under test can produce the flip. Mutation-checked by zeroing
    each weight in turn — the first version of the text case survived a zeroed
    text weight, which is how the flaw was found; it now fails.
  - Every sort ends in `effectivePostedAt DESC, id DESC`, M4.2's total order, so a
    job cannot swap pages and hide from someone paging through. A paging case
    asserts it under `sort=juniorScore`.
  - `sort` values are matched **exactly**, unlike the enum facets M9.2 reads
    case-insensitively: no case fold round-trips `juniorScore`, so accepting
    `juniorscore` would mean maintaining a second spelling of each.
  - **The M9.2 fixtures were re-pointed, not just extended.** Four filter cases had
    used an `EXPERIENCED` job as their counter-example, which this milestone now
    hides by default — they would have kept passing while testing nothing. A new
    `AMBIGUOUS` fixture takes over every filter role, and the experienced bands are
    reserved for the default-set cases.

### M9.4 — Pagination and validation
- [x] Offset pagination, `pageSize` at most 50, envelope `{ items, page, pageSize, total }`
- [x] Unknown query params rejected by `forbidNonWhitelisted`
- Verify: e2e — `pageSize=500` is rejected and an unknown param returns 400.
- Verified 2026-08-23: 14 new e2e cases in `test/search.e2e-spec.ts` (70 in the
  suite), a new `src/common/dto/pagination.query.spec.ts` (17 cases) and one added
  case in `test/jobs.e2e-spec.ts`. The full backend is 1044 unit and 201 e2e.
  - **This milestone found and fixed a real 500.** `page` had no upper bound, and
    `Number.isInteger(1e20)` is `true` — so `?page=1e20` passed validation, became
    an `OFFSET` past what PostgreSQL's `bigint` can hold, died inside the driver,
    and returned **`500 Internal server error` for input the API should have
    refused**. Both `/jobs/search` and `/jobs` answered that way, since they share
    `PaginationQuery`. Confirmed by probing the running endpoint before writing
    any test, not inferred.
  - **`MAX_PAGE = 200`** closes it: 200 pages at `MAX_PAGE_SIZE` is 10 000 results
    deep, and the deepest reachable `OFFSET` is 9 950. The bound is on `page`
    rather than on the computed offset because that is what the DTO idiom already
    expresses; the depth it allows varies with `pageSize`, which is acceptable
    because a client picks a page size and keeps it. Past that depth offset
    pagination is the wrong instrument — every page re-pays the whole offset — and
    per `PRODUCT.md` §8 someone at result 10 000 needs a narrower search, not a
    deeper page. Mutation-checked by deleting the `@Max`: 2 e2e and 3 unit cases
    fail.
  - **The shared DTO got its own spec.** `PaginationQuery` had none — its rules
    were asserted only through whichever endpoint happened to exercise them, and a
    change to it changes every list route. `common/dto/pagination.query.spec.ts`
    now owns the parsing and both bounds; the endpoint suites only prove the route
    applies them.
  - The rest of the milestone was already standing from M4.2 and is now pinned on
    the search route as well: the envelope's exact key set, `total` describing the
    whole match rather than the page, a full walk across pages with no gap or
    repeat, an empty page past the end with `total` intact, `pageSize=500` and
    `pageSize=51` rejected while `50` is served, and `forbidNonWhitelisted`
    rejecting both an unknown parameter and M9.5's not-yet-implemented one.
  - **A repeated scalar key is rejected, not silently halved.** `?page=1&page=2`
    and `?q=a&q=b` arrive as arrays; `@IsInt` and `@IsString` refuse them rather
    than the endpoint quietly picking one of the two values.

### M9.5 — Profile-fit ranking
- [x] Authenticated requests weight by the user's technologies and locations
- [x] Applied at query time only; the stored score stays user-independent
- [x] Search remains usable without a token
- Verify: an integration test — the same query ranks differently for two profiles
  while the stored `juniorScore` is unchanged.
- Verified 2026-08-23: `profile-fit ranking` in `test/search.e2e-spec.ts` (10 new
  cases, 80 in the suite), 14 new unit cases across `search.service.spec.ts` and
  `jwt-auth.guard.spec.ts`. The backend is 1058 unit and 211 e2e. **Phase 9 is
  complete.**
  - **`@Public()` had to become `@OptionalAuth()` first** — the guard M4.2 said
    this milestone would need. `@Public()` returns before a token is ever read, so
    a caller sending a valid one still arrived anonymous; `/jobs/search` is "opt."
    in §8, not "–". The new metadata key adds one branch to `JwtAuthGuard`: no
    token on an optional route is served with no user attached.
  - **A token that is present but invalid is still a 401**, on the optional route
    too. Ignoring it would answer an expired session with a 200 and unpersonalized
    results — the user silently loses their ranking and M11.3's refresh-on-401
    interceptor never fires. Absent and invalid are different requests.
  - **No query parameter.** §8.1 declares none, so fit follows the token, and
    `?profileFit=true` stays a 400 like any other undeclared parameter. The M9.4
    cases asserting that rejection did not change; only their comments did, since
    "not implemented yet" stopped being the reason.
  - **Ranking, never filtering.** Two profiles get the same jobs and the same
    `total` in different orders. A profile that narrowed would hide jobs the user
    never asked to hide, and would make one URL mean different things to different
    people — asserted directly, not just implied by the ordering cases.
  - **The blend is renormalized rather than extended.** Profile fit takes `0.2`
    and the three M9.3 terms are scaled by `0.8`, so their proportions to one
    another are untouched and an anonymous request is ranked by the identical
    expression it was before. Adding a fourth term that silently re-tuned the
    first three would be a ranking change nothing in the suite would have caught.
  - **Technology fit saturates at three matches.** Dividing by the size of the
    profile's list would mean a user who saved ten skills needs all ten to score
    what a user who saved one scores with one — the term would do *less* work the
    more carefully someone filled in their profile. Place fit is binary and ORs
    free-text `locations` with `countryCodes`: they are two vocabularies with no
    common scale, so grading a city hit against a country hit would be invented.
    A side the profile leaves empty forfeits its share to the other rather than
    capping a fully-filled side below 1.
  - **An empty profile is `null`, not a fit of nothing.** A registered user who
    has never saved anything ranks exactly like an anonymous one, and the profile
    is not fetched at all when it could not change the answer — anonymous, or an
    explicit `sort=juniorScore` / `sort=postedAt`, which a preference must not
    perturb.
  - Mutation-checked, three ways: zeroing the profile weight, letting fit ride on
    every sort, and swallowing an invalid token on the optional route each fail a
    case (1 e2e, 2 unit, 1 unit respectively).
  - `SearchModule` imports `ProfilesModule` and reads the row through
    `ProfilesService`, which owns `prisma.profile` (§4.2). `ARCHITECTURE.md` §4.3's
    graph gained the `search → profiles` arrow, which §6.5 always implied.
  - **Known issue, pre-existing and not from this milestone.** `npm run test:e2e`
    fails intermittently under Jest's default parallelism: the ingestion and
    deduplication suites share fixture source rows and interfere with each other.
    Confirmed on a clean tree (`git stash`) — the same suites fail with none of
    this milestone's code present, and each passes alone. `--runInBand` is green:
    13 suites / 211 tests.

---

## Phase 10 — Saved Jobs

Goal: a user can keep jobs and come back to them.

### M10.1 — Saved jobs API
- [x] `GET /saved-jobs`, `POST /saved-jobs`, `DELETE /saved-jobs/:jobId`
- [x] Unique per `(userId, jobId)`; saving twice is idempotent
- [x] A user can only reach their own saved jobs
- Verify: e2e — save, list, save again with no duplicate, delete, list empty; user B
  cannot delete user A's saved job.
- Verified 2026-08-23: `modules/saved-jobs/` (module, controller, service, two
  DTOs) plus `saved-jobs.service.spec.ts` (13 cases) and
  `test/saved-jobs.e2e-spec.ts` (28 cases). The backend is 1072 unit and 239 e2e.
  - **Ownership is structural, not checked.** Every service method takes `userId`
    as its first argument and puts it in the `where`; no method accepts a
    `SavedJob` id, and no route names one — `DELETE /saved-jobs/:jobId` addresses
    the *job*, scoped to the caller. That is `ProfilesService`'s rule (M3.6), and
    unlike an `if (row.userId !== userId)` it cannot be forgotten. `SavedJob.id`
    is not in the response at all: publishing an identifier no route accepts
    invites a client to build against it.
  - **User B deleting user A's save and deleting one that never existed are the
    same 404**, because `deleteMany({ userId, jobId })` matched nothing in both
    cases and never saw the difference. Asserted by comparing the two response
    bodies, so the endpoint cannot be used to probe what another account saved.
  - **`DELETE` is deliberately not idempotent.** 204 when a row went away, 404
    when none did. An idempotent 204 would answer success to a delete that
    deleted nothing — a lie the client cannot detect. `POST` *is* idempotent,
    because the milestone requires it and "already saved" is a success.
  - **Idempotency is a database property, not a read-then-write.** An `upsert` on
    the `(userId, jobId)` unique with an **empty** `update`: two simultaneous
    saves cannot race into a unique-constraint 500, and `createdAt` stays at the
    *first* save — re-stamping it would bounce a job to the top of the user's
    list every time a client repeated a save it had already made.
  - **Merged and deactivated jobs are saved and listed, not filtered.**
    `LISTABLE_JOBS_WHERE` is right for a discovery list, where a stale job is
    noise; here it would unsave rows on the user's behalf. Resolving the merge
    redirect and flagging the inactive one is **M10.2** — until then such a job
    lists exactly as stored, which is the one thing about this milestone that is
    deliberately incomplete.
  - **`SavedJob.note` stays out of the API.** The column exists (§3.5) but no MVP
    flow surfaces it, and accepting it would force an idempotency rule nothing
    asks for — whether a second save overwrites the first note or keeps it. M10.1
    saves a job; it does not annotate one. The column stays NULL.
  - `POST` checks the job exists first, so an unknown `jobId` is a 404 rather than
    the 500 the foreign key would otherwise raise. The check reads through a new
    `JobsService.exists()` and `JOB_SUMMARY_SELECT` is now exported, so
    `prisma.job` keeps a single owner (§4.2) and the saved list projects the job
    through the *same* summary the search and job lists return — one card
    everywhere, one projection to keep in sync.
  - The list uses the shared `{ items, page, pageSize, total }` envelope and
    `PaginationQuery`, ordered `createdAt DESC` — what `SavedJob(userId,
    createdAt DESC)` is indexed for — with a `jobId` tiebreak for M4.2's reason:
    without a total order two saves in one millisecond can swap places between
    pages and hide one.
  - Mutation-checked four ways, each caught: unscoping the delete from the caller
    (3 e2e), re-stamping `createdAt` on a repeat save (1), reporting success for a
    delete that removed nothing (2), and dropping the job-exists check (1).

### M10.2 — Saved jobs survive the pipeline
- [x] A saved job whose `Job` was merged resolves through `mergedIntoJobId`
- [x] A saved job whose `Job` went inactive still loads, flagged as inactive
- Verify: an integration test covers both cases (extends M7.4).
- Verified 2026-08-23: `JobsService.findCanonicalSummaries()`, a rewritten
  `SavedJobResponse`, and the resolution step in `SavedJobsService.list`, with
  six new cases in `saved-jobs.service.spec.ts`, six in `jobs.service.spec.ts`,
  three more in `test/saved-jobs.e2e-spec.ts` (31 cases) and one in
  `test/deduplication-merge.e2e-spec.ts` (12) that runs a *real* merge and then
  reads the saved list. The backend is 1084 unit and 243 e2e.
  - **Resolved when read, not rewritten when merged.** M7.4 leaves `SavedJob`
    rows untouched on a merge — that is what D2's tombstone is for — so the list
    walks `mergedIntoJobId` at query time instead. The alternative, rewriting
    every user's saves inside the merge transaction, turns a correction to *one*
    job into a write across every account that saved it, and still cannot fix a
    row written between the merge and the rewrite.
  - **`jobId` is still the id that was saved, and `job.id` is the one now shown.**
    They differ after a merge, and `redirectedToJobId` names the survivor rather
    than making a client compare the two. `jobId` is not quietly updated because
    it is the row the user owns and the id `DELETE /saved-jobs/:jobId` takes:
    resolving the redirect on delete as well would make the survivor's id delete
    a save of the tombstone, and both can be saved at once. An e2e pins that —
    unsaving by the survivor's id is a 404, by the saved id a 204.
  - **Saving both ends of a merge stays two rows showing one card.** They were
    two vacancies when they were saved; collapsing them would delete a row the
    user created, and `total` would then disagree with what is listed.
  - **`isActive` went on `SavedJobResponse`, not on `JobSummaryResponse`.** The
    discovery lists filter on it (`LISTABLE_JOBS_WHERE`), so on their cards it
    would be a constant `true` — three endpoints' contracts widened, including
    `search`'s hand-written SQL column list, to carry a column that can only vary
    in one of them.
  - **Only the tombstones pay for the feature.** The saved page already joins the
    job, so it now also selects `isActive` and `mergedIntoJobId`; the second
    read happens only for rows where the latter is not null, which on nearly
    every page is none. `findCanonicalSummaries` then loads all the survivors in
    one `findMany`, so two saves that merged into the same job fetch one row.
  - **A broken merge chain degrades to M10.1's behaviour rather than a gap.** A
    cycle or an over-long chain leaves the id absent from the map (the walk has
    already logged it), and the entry lists as stored. `GET /jobs/:id` 404s on the
    same data because it can afford to; a list cannot answer "one of your saved
    jobs is missing, and no, you may not have it".
  - `countDistinctSources()` now lives beside `JobSummaryResponse`: the same
    `new Set(postings.map(…))` was about to be written a fourth time, and two
    copies of "also listed on N sources" that can disagree is worse than one
    exported function. `search/` still counts in SQL (§5.4).
  - Checks after the change: backend `npm test` 65 suites / 1084 tests and
    `npm run test:e2e` 14 suites / 243 tests pass (from 1072 and 239),
    `npm run build` clean, `npm run lint` clean, Prettier-clean on every file
    touched. The database after the run holds the dev seed and nothing else — no
    `saved-jobs-e2e` job, source or user, and no `t4-` row.
  - **One test-infrastructure fix, and it is not cosmetic.** The e2e suites all
    run against one database and Jest was running them in parallel workers; the
    fourteenth suite tipped it over, and ingestion, tier-1 dedup and raw
    ingestion started failing on each other's row counts — differently on each
    run, and never when run alone. `test/jest-e2e.json` now sets `maxWorkers: 1`.
    These suites were only ever passing by luck of the interleaving, and a suite
    that fails depending on scheduling teaches everyone to re-run rather than to
    read the failure.

---

## Phase 11 — Angular Frontend

Goal: the product is usable in a browser.

### M11.1 — Workspace scaffold
- [x] Angular 22 workspace in `frontend/`, standalone components, SCSS
- [x] `provideRouter` wired in `app.config.ts`
- [x] Vitest via `@angular/build:unit-test`
- Verify: `npm start` in `frontend/` serves the app; `npm test` runs.

### M11.2 — Application shell
- [x] Replace the default welcome page with a real shell (header, nav, router outlet)
- [x] Route table with lazy `loadComponent` / `loadChildren` for every feature
- [x] Global styles: tokens, spacing, typography
- Verify: navigating between two lazy routes loads separate chunks.
- Verified 2026-08-23: `app.ts`/`app.html`/`app.scss` are now the shell, `app.routes.ts`
  plus `features/auth/auth.routes.ts` are the route table, `styles.scss` holds the
  tokens, and six placeholder pages under `features/` exist only to be routed to.
  `app.spec.ts` (4 cases) and a new `app.routes.spec.ts` (4) — 8 frontend tests.
  - **The build is the verification.** `npm run build` emits eight lazy chunks —
    `search-page`, `job-detail-page`, `saved-jobs-page`, `profile-page`,
    `login-page`, `register-page`, `not-found-page` and `auth-routes` — against a
    227 kB initial chunk. Nothing routed is in the initial bundle.
  - **`auth` is the one `loadChildren`**, the rest are `loadComponent`. Auth is the
    only area with two sibling screens and a shared prefix, so it is the only one
    where a child route table earns its file; using `loadChildren` everywhere would
    be a routes file per page with a single entry in it.
  - **The placeholder pages are deliberately empty.** Each is a heading and one
    sentence naming the milestone that fills it in (M11.4 and M11.6–M11.9). A route
    that cannot resolve a component is not a route table, so they exist — but
    building any of their real content here would be building M11.6 early.
  - **A catch-all `**` route renders a 404 page rather than a blank outlet**, and it
    is last, where the router's first-match order requires it. `app.routes.spec.ts`
    pins that position: moving it up silently swallows every route below it.
  - **Tokens are CSS custom properties on `:root`, not SCSS variables.** Colour,
    type scale, a 4px spacing scale, radii, shadows and the layout width are read
    at runtime, so a component's `.scss` and the global sheet cannot drift into two
    palettes, and M11.5's `ui/` primitives inherit them without importing anything.
    Light only — no dark theme, because nothing asks for one and every token would
    then have two values to keep honest.
  - **`.page` is the only global layout class.** Page width and the space under the
    header are defined once; the alternative is the same container copied into six
    feature stylesheets and diverging on the seventh.
  - **The footer carries the "not a prediction of getting hired" line** on every
    screen, and a test asserts it. `PRODUCT.md` §8 and M13.4 require the score never
    to read as a hiring chance; putting the sentence in the shell means it cannot be
    forgotten on a page that shows a score.
  - Each route sets `title`, so the browser tab and history are meaningful before
    any page has content. Nav uses `routerLinkActive` without `exact`, so `/jobs/:id`
    keeps **Search** highlighted — a detail page reached from a search still shows
    where the user is.
  - Checks after the change: `npm test` 2 suites / 8 tests pass, `npm run build`
    clean, Prettier-clean on every file touched, `npm start` serves the shell at
    `localhost:4200`.

### M11.3 — Core layer
- [x] `core/models` — API contract interfaces mirroring the response DTOs
- [x] `core/api` — typed HTTP clients for jobs, profiles, saved jobs, auth
- [x] `core/interceptors` — attach the access token, normalize errors, refresh once on 401
- [x] `core/auth` — signal-based `AuthService` plus an auth guard
- Verify: Vitest covers token attachment, the refresh-on-401 path, and search
  filter serialization.
- Verified 2026-08-23: `core/` holds the four folders of `ARCHITECTURE.md` §10 —
  eight model files, four API clients, two functional interceptors, and
  `TokenStorage` / `AuthService` / `authGuard`. 51 frontend tests across 8 suites,
  up from 8; `npm run build` still emits the same eight lazy chunks against a
  254 kB initial bundle.
  - **Refreshing once is structural, not a counter.** The replayed request is
    issued through the interceptor's own `next`, not through `HttpClient`, so it
    cannot re-enter the interceptor: a second 401 has nowhere to recurse to and
    propagates to the caller. A retry counter would have to be threaded through a
    header or a context token and could be got wrong; this cannot.
  - **The in-flight refresh is shared.** Refresh tokens *rotate* — the response
    carries a new one and retires the sent one — so two requests failing 401
    together must not each call `/auth/refresh`. The second joins the first's
    observable (`shareReplay`, `refCount: false`), and a test pins that two
    simultaneous failures produce exactly one refresh call.
  - **A 401 on an anonymous request is not refreshed.** It means the route needs
    a login, not that a token went stale. Refreshing there would sign the user out
    of a session they never had, and `/auth/login`, `/auth/register` and
    `/auth/refresh` never receive a bearer header at all — but `/auth/logout`
    does, because it is authenticated and the backend scopes revocation to the
    caller.
  - **`errorInterceptor` is registered first, so it is outermost.** That leaves
    `authInterceptor` seeing the raw `HttpErrorResponse` it needs to recognise a
    401, and a request that recovers through a refresh never produces an error at
    all. Reversing the two would silently kill the refresh path — the reason the
    order is commented at the provider.
  - **`ApiError` is the only error a component sees.** NestJS answers
    `{ statusCode, message, error }`, where `message` is a string for a thrown
    exception and a `string[]` for a validation failure; both are read and the
    whole array is kept, because a form needs every violated rule. An
    unrecognized body falls back to the status text rather than rendering
    `[object Object]` at the user.
  - **Dates are typed `string`, not `Date`.** `HttpClient` does not revive them,
    so `Date` would be a type that lies about what is in the object. `IsoDateString`
    names the intent and a component constructs a `Date` where it formats one.
  - **Enums are union types with a `const` array**, not TypeScript `enum`s: the
    wire values are plain strings, and the filter panels of M11.6 need to *list*
    the members, which a second hand-written list would drift from.
  - **`isAuthenticated` is derived from the token's presence, not its validity.**
    A client cannot verify a signature, and an expired token is still the
    difference between showing the app and showing the login form — expiry is
    discovered on the next request, where the interceptor refreshes or clears the
    session.
  - **Tokens live in `localStorage`**, wrapped in try/catch because a browser with
    site data blocked *throws* rather than returning null. The backend returns
    tokens in a JSON body rather than setting a cookie, so a JS-readable store is
    the only option that survives a reload; moving to httpOnly cookies is a
    backend decision, not one the frontend can take alone.
  - **`toSearchParams` repeats the key for every list value** and never
    comma-joins, because `locations` may legitimately contain "Berlin, Germany".
    Cleared fields are dropped rather than sent empty — `?technologies=` would
    read as a filter — while `0` survives, since `minJuniorScore=0` is a filter
    and not an absence.
  - **`/saved` and `/profile` are now guarded**; search and job detail are
    deliberately not, because the product must be evaluable before signup. The
    guard returns a `UrlTree` carrying `redirectTo`, so M11.4 can return the user
    to the page they were opening in a single navigation.
  - **`API_BASE_URL` is an injection token** fed by `environments/`, with
    `environment.model.ts` holding the shared interface — a type exported from
    `environment.ts` would vanish in the development build, where that file is the
    one `fileReplacements` swaps out. Production defaults to same-origin `/api/v1`;
    development points at `localhost:3000`.
  - Checks after the change: `npm test` 8 suites / 51 tests pass, `npm run build`
    clean, Prettier-clean on every file touched.

### M11.4 — Auth screens
- [x] Login and register forms with validation and server-error display
- [x] Redirect to the intended route after login; the guard protects private routes
- Verify: component tests on validation; a manual register → login → search flow.
- Verified 2026-08-23: `features/auth/` now holds two reactive forms sharing one
  stylesheet, `field-errors.ts` and `redirect-target.ts`. 79 frontend tests across
  11 suites, up from 51. The flow was exercised against the running backend with
  `curl`: register → 201 with tokens, the same email again → 409
  `"Email already registered"`, a short password → 400 with a message array,
  a wrong password → 401 `"Invalid email or password"`, `/users/me` → the account,
  anonymous `/jobs/search` → 200, and `/saved-jobs` without a token → 401. Those
  are exactly the four response shapes the forms render.
  - **The forms mirror the backend's validators, neither looser nor stricter.**
    Looser turns a fixable field into a 400 the user has to decode; stricter
    refuses input the API would have taken. That is why login validates the
    password as *required only*: the 10-character minimum is a `RegisterDto` rule,
    and enforcing it on login would refuse to even attempt an older account's
    password — and would tell an attacker the password's shape before they sent one.
  - **Nothing is marked wrong until the field is touched or the form is
    submitted.** A form that greets the user with three errors before they have
    typed is telling them off for not having started. Submitting blank calls
    `markAllAsTouched`, because a silent refusal reads as a broken button.
  - **One message per field, not all of them.** "is required" and "must be at
    least 10 characters" together is noise; the first unmet rule is the one to fix.
  - **`redirectTo` is sanitized, and this is the security-relevant part of the
    milestone.** The value comes from the query string, so
    `/auth/login?redirectTo=https://evil.example` would otherwise be an open
    redirect that sends a user off-site *at the moment they have just signed in*.
    `safeRedirectTarget` accepts only a same-origin path — rejecting `//host`,
    `/\host`, anything containing `://`, and control characters, which browsers
    strip before resolving a URL — and falls back to `/jobs` rather than refusing
    a valid login.
  - **Registration signs the account in on the spot**, because `/auth/register`
    returns the same token pair `/auth/login` does. Sending someone who has just
    proved their password to a login form to retype it is a step that exists for
    nothing. Both screens carry `redirectTo` across the link between them, so
    "actually, I need an account" does not lose the destination.
  - **Server messages are rendered verbatim, all of them.** A validation failure
    returns one per broken rule and the list is shown; a refused login returns the
    single deliberately ambiguous "Invalid email or password", which is what keeps
    the form from being an account-enumeration oracle. The pages are written
    against `ApiError`, so their specs provide `errorInterceptor` — the same chain
    the application does, rather than a hand-shaped error object.
  - **The shell became session-aware, which was not in the milestone text but is
    implied by it.** Without it there is no way to sign out, and a signed-in user
    is still invited to log in. The header now shows the account email and a
    `Log out` **button** — a control that changes state is not a link — and the
    shell asks `/users/me` once when tokens are present but the user is not
    loaded, which is what a reload leaves behind. A failure there costs the header
    an email address and nothing else.
  - **The initial bundle grew 256 kB → 272 kB** and `@angular/forms` is *not* part
    of it: the build check confirms `formControlName` appears only in the login,
    register and their shared lazy chunk. The growth is the eagerly-referenced
    session code in the shell.
  - Checks after the change: `npm test` 11 suites / 79 tests pass, `npm run build`
    clean, Prettier-clean on every file touched, and the live-API contract check
    above. Not done: a click-through in a browser — the automated coverage and the
    `curl` flow stand in for it.

### M11.5 — Shared components
- [x] `junior-score-badge` — labelled **"Junior Match"**, never a bare percentage
- [x] `signal-list` — positive signals and potential concerns with their evidence
- [x] `job-card` composing both; `ui/` primitives (button, input, chip, empty-state, spinner)
- Verify: component tests assert the score never renders without its evidence and
  that the label is correct.
- Verified 2026-08-23: `shared/` now holds the four folders of `ARCHITECTURE.md` §10
  — `ui/` (five primitives), `junior-score-badge/`, `signal-list/` and `job-card/` —
  plus `enum-labels.ts`. 148 frontend tests across 19 suites, up from 79 across 11.
  `npm run build` is clean and the initial bundle is unchanged at 272 kB: nothing
  routed imports these yet, which is what keeps M11.6–M11.8 from having been
  started here.
  - **The score cannot be rendered without its evidence, structurally.**
    `evidenceShown` is the caller asserting that a `signal-list` sits next to the
    badge; without it the badge falls back to the `JuniorLevel` band, which §6.5
    names as the right thing to show when the evidence cannot be. A page gets a bare
    percentage only by asserting the opposite of the truth — never by forgetting
    something. `job-card` does not even take the assertion: it composes both
    components, works out for itself whether any evidence will render, and hands
    that same answer to the badge, so the two cannot fall out of step.
  - **A search result therefore shows the band, not the number, and that is
    correct.** `JobSummary` carries `juniorLevel` and `juniorScore` but no signals —
    the list projections deliberately omit them — so there is no evidence to put
    beside a percentage on a result card. §6.5's escape clause covers exactly this
    case. The signals are component *inputs* rather than fields read off the job, so
    the detail page (M11.7), or a list endpoint that grows them later, gets the
    number without this component changing.
  - **The label is not an input.** "Junior Match" is hard-coded in the template, so
    no caller can retitle the number into a prediction. The screen-reader label says
    "78 out of 100" rather than "78%", because a percent sign read aloud invites the
    probability reading the rest of the wording is careful to avoid.
  - **A level is required before the number is shown**, not only the evidence: the
    band is the number's context, and "94%" over "Not yet assessed" is a bare
    percentage in all but name. The two always arrive together from the backend, so
    this only decides what an inconsistent row looks like.
  - **`@if (shownScore() !== null)`, not the aliasing form.** A score of `0` is a
    real answer — `CLEARLY_EXPERIENCED` bottoms out there — and `@if (x; as y)`
    treats it as absent, which would have silently dropped the number on the
    worst-fitting jobs. A test pins it.
  - **`signal-list` drops any signal with no excerpt.** In practice §5.3 guarantees
    there are none; it is a floor rather than a workaround, because a signal without
    the posting's own words is a claim the reader cannot check, and being able to
    argue with the classification is the whole point of showing signals. The same
    function answers "may the badge show the number?", so an empty list and a hidden
    score are one decision.
  - **The signal codes are worded here, and the wording is checked against the
    backend.** The API sends `{ code, weight, evidence }` and no English.
    `signal-labels.spec.ts` reads `backend/.../signal.ts`, extracts `SIGNAL_WEIGHTS`
    and fails in both directions — a code with no wording, or wording for a code the
    classifier no longer emits. An unknown code still renders (title-cased) rather
    than being dropped, because a stored classification outlives the build that
    wrote it and M8.7's AI stage may emit codes this build has never seen.
  - **Every label describes the posting, never the reader's prospects** — "5+ years
    of experience required", not "you are unlikely to qualify". The label sits
    directly above a verbatim quote, and a label that editorialized would be putting
    a claim next to evidence that does not support it. A test asserts the wording.
  - **`score-naming.spec.ts` is now mirrored on the frontend**, over `.ts` *and*
    `.html`. The backend's guard cannot see templates, and the template is where a
    correctly-named `juniorScore` would become a hiring prediction. Comments are
    stripped for the backend's reason, and three files are exempt by exact path
    because the prohibited words are their subject matter.
  - **The `ui/` primitives are attributes on native elements**, not wrappers:
    `button[appButton]`, `input[appInput], textarea[appInput], select[appInput]`. A
    wrapper would have to re-expose `type`, `disabled`, `form`, focus order and the
    Enter/Space handling a screen reader relies on — and, on the input, reimplement
    `ControlValueAccessor`, which is where the auth forms' `formControlName` would
    break. `ui.spec.ts` pins both: the form control stays bound to the real element,
    and a `<select>` keeps its `<option>`s (a component drops content it does not
    project, so the template carries `<ng-content />` for that alone).
  - **`job-card` is presentational and stays that way.** Saving is M11.8 and arrives
    through a `card-actions` projection slot rather than by the card learning about
    the saved-jobs API. `postedAt` and `effectivePostedAt` are labelled differently
    — "Posted" only when the source stated a date, "First seen" otherwise — because
    the fallback is when this system first saw the posting, and calling that
    "Posted" would be inventing a fact.
  - **`@types/node` was added as a devDependency** and `node` to `tsconfig.spec.json`'s
    `types`, for the two file-reading specs. `tsconfig.app.json` still lists no types,
    so a component cannot import `node:fs`. `import.meta.url` is not a `file:` URL
    under `@angular/build:unit-test`, so both specs find the repository root by
    walking up from the working directory instead.
  - Not done, deliberately: the auth screens still carry their own field and button
    rules in `auth-form.scss` rather than using the new primitives. Migrating them is
    a change to a finished milestone's screens, not part of building the shared
    layer; `auth-form.scss`'s comment still names it as the follow-up.
  - Checks after the change: `npm test` 19 suites / 148 tests pass, `npm run build`
    clean, Prettier-clean on every file touched.

### M11.6 — Search page
- [x] Query input, filter panel, result list, pagination
- [x] Filters mirrored into URL query params, so a search is shareable and survives reload
- [x] Loading, empty, and error states
- Verify: reloading a filtered URL restores the same result set.
- Verified 2026-08-24: `features/search/` now holds the three parts `ARCHITECTURE.md`
  §10 names — the search page, the filter panel and the result list — plus
  `search-query-params.ts`, `pagination/` and `multi-value-field/`. 231 frontend
  tests across 24 suites, up from 183 across 20. `npm run build` is clean; the
  initial bundle is unchanged at 284 kB and the whole page is one 46.6 kB lazy
  chunk. `search-page.spec.ts` opens a URL carrying all thirteen parameters and
  asserts the outgoing request, which is the `Verify:` line.
  - **The URL is the search, and nothing else holds it.** `parseSearchQuery` reads
    the route's `ParamMap`, `rxResource` derives the request from it, and every
    control that changes the search navigates instead of setting local state. A
    reload, the back button and a pasted link therefore run the *same* code path as
    a fresh visit — shareability is a consequence of the structure rather than
    save-and-restore code that could get it wrong.
  - **Parsing never rejects a whole URL.** `?minJuniorScore=abc`, a `juniorLevel`
    this build no longer knows, a page number past the API's cap: each drops that
    one parameter and answers the rest. A hand-edited or stale link losing a filter
    is recoverable; a blank page is not. Every bound is the one
    `search.query.ts` declares, so what leaves is a request the API accepts rather
    than a 400 the reader cannot act on.
  - **Out of range is dropped, not clamped.** `?minJuniorScore=900` is a mangled
    URL, not a request for 100, and answering a different question than the address
    bar shows is worse than answering the unfiltered one. `countryCode` is the one
    parameter that is never truncated to its cap either: cutting an alpha-3 code to
    two characters turns `AUT` into Australia and `SVN` into El Salvador, so a wrong
    country would be answered confidently. A test pins each.
  - **A value equal to the API's own default is never written.** `sort=relevance`,
    `page=1` and the default page size stay out of the address bar, so a shared link
    says only what the user chose and the backend's defaults remain the single
    definition of them — a link that pinned them would keep answering with
    yesterday's default after the API changed its mind.
  - **The panel is a draft; the URL is the truth.** `SearchFilters` takes the query
    in and emits the edited one out; it never calls the API or the router, so it
    cannot disagree with the address bar. An edit that is never submitted is
    discarded by the next navigation, and paging reads the URL rather than the
    panel — pressing Next cannot quietly apply a filter that was typed and never
    applied. Both are tested.
  - **`sort` is the page's, not the panel's.** The panel emits no ordering at all,
    so applying a filter cannot silently reset one the user chose, and "Clear all"
    never has to decide whether an ordering counts as a filter. Re-ordering and
    applying a new filter set both return to page one, because page seven of one
    ordering is a different set of jobs from page seven of another.
  - **Naming a `juniorLevel` is the opt-in, and the panel says so.** `PRODUCT.md` §8
    keeps `EXPERIENCED` and `CLEARLY_EXPERIENCED` out of the default result set, and
    M9.3 made an explicit level filter the way back in. The panel offers all five
    bands with a note explaining it; no separate "include experienced" control was
    invented, because §8.1 declares no such parameter.
  - **Technologies and locations are entered one value at a time**, as removable
    chips. Both are lists where several values *widen* the search, and a
    comma-separated box cannot express that for `locations` — "Berlin, Germany" is
    one plausible value, which is exactly why the backend refuses to split that
    parameter on commas. Enter adds a value rather than submitting the form, so a
    typed filter cannot be lost to the submit that was meant to apply it.
  - **`rxResource`, not a hand-rolled subscription.** One request per distinct
    query, cancelled and replaced when the URL moves on, which is what keeps a late
    response from overwriting a newer one. `value()` *throws* in the error state, so
    the page reads it through `hasValue()` rather than guarding on `error()` and
    trusting the two to stay in step.
  - **The three states are distinguishable, and the empty one is specific.** "No
    jobs match this search" reads differently depending on whether filters are on,
    a query was typed, or neither — the last case is the honest one to show before
    any adapter has been reviewed, since there is nothing ingested yet. A failed
    search shows the server's own words with a retry that re-runs the same request
    rather than sending the user back to rebuild their filters.
  - **The result list is left in place while the next page loads**, with an
    "Updating…" note, rather than being replaced by a spinner. The spinner is for
    the first search only. A result set that flickered away on every filter change
    would be harder to compare against, and the layout would jump.
  - **A result card shows the band, not the number**, and that is M11.5's decision
    unchanged: `JobSummary` carries no signals, so there is no evidence to put beside
    a percentage. The page states what a Junior Match score is above the first
    result, and `score-naming.spec.ts` covers the new templates automatically.
  - **Pagination is previous/next only.** A numbered strip would have to decide how
    to elide a hundred pages and answers a question nobody asks of a ranked list.
    Next stops at page 200, the cap the API enforces — offering the button past it
    would be offering a 400.
  - Not done, deliberately: the job cards link to `/jobs/:id`, which is still M11.7's
    placeholder, and they carry no save control — that is M11.8, and `job-card`
    already has the `card-actions` slot waiting for it.
  - Checks after the change: `npm test` 24 suites / 231 tests pass, `npm run build`
    clean, Prettier-clean on every file touched.

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
