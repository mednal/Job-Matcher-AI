# JuniorJob AI — MVP Architecture

Status: proposed
Scope: MVP only (see `docs/PRODUCT.md` §9 for MVP boundaries)
Style: modular monolith

## How to read this document

This is an **MVP design document, not an implementation checklist.**

It describes the intended shape of the system — module boundaries, the data model,
and the direction of dependencies — so that implementation work has a target to aim
at. It does not describe implemented code, and it is not a mandate to build every
component named here before the product works.

Three consequences:

1. **The structural decisions are binding.** The module boundaries (§4), the
   three-level job model (§5.1), the one-way dependency rule (§4.2), and the source
   acquisition policy (§7) are expensive to change later. Implementation should
   follow them from the start.
2. **The infrastructure details are proposals.** Refresh-token rotation, rate
   limiting, structured logging, ingestion scheduling, retention jobs, the raw
   document cleanup, the AI classifier stage — each is the recommended answer for
   when that concern becomes real. Build each one when it is needed, not to
   complete the document. A working vertical slice beats a complete skeleton.
3. **Individual tasks still govern.** Per `CLAUDE.md`, implement only what a task
   asks for. This document is context for that work; it is not standing
   authorization to build ahead of it.

Features under "Future SaaS Evolution" (§13) must not be built during the MVP.

**The data model has moved.** `docs/DATABASE.md` is the authoritative description of
the database — every model, constraint, index, and the raw SQL Prisma cannot
express. Its design decisions are approved, not proposed. §5 of this document keeps
the structural rules (the three-level job model, retention, search strategy) and
points there for the schema itself.

---

## 1. Architectural Goals

The architecture is shaped by four product facts:

1. **Job sources are unstable and heterogeneous.** Each source has its own schema,
   its own rate limits, and its own terms of use. Sources will be added and removed.
   Therefore source integrations must be replaceable plugins behind an interface.
2. **The product value is classification quality, not result volume.** The
   classification logic is the part of the system most likely to be iterated on.
   It must be deterministic where possible, versioned, and testable without a network.
3. **The same vacancy appears on several sources.** Deduplication is a first-class
   concern, not a post-processing detail. It shapes the data model.
4. **The MVP is small.** One deployable backend, one deployable frontend, one
   database. No queues, no microservices, no search cluster.

Non-goals for the MVP: horizontal scaling, multi-tenancy, billing, real-time updates.

---

## 2. System Overview

```
┌─────────────────┐        HTTPS / JSON        ┌──────────────────────────┐
│  Angular SPA    │ ─────────────────────────► │  NestJS Modular Monolith │
│  (frontend/)    │ ◄───────────────────────── │  (backend/)              │
└─────────────────┘                            └────────────┬─────────────┘
                                                            │ Prisma
                                        ┌───────────────────┴───────────────────┐
                                        │            PostgreSQL                 │
                                        │  users · jobs · postings · raw docs   │
                                        │  classifications · saved jobs         │
                                        └───────────────────────────────────────┘
                                                            ▲
                                          scheduled ingestion (in-process cron)
                                                            │
                                        ┌───────────────────┴───────────────────┐
                                        │  External job sources (official APIs  │
                                        │  and permitted feeds only)            │
                                        └───────────────────────────────────────┘
```

A single Node process serves the HTTP API and runs the ingestion schedule. This is
adequate for MVP volumes and keeps operations trivial. Section 13 describes how
ingestion is extracted into a separate worker when that stops being true.

---

## 3. Repository Layout

```
juniorjob-ai/
├── CLAUDE.md
├── docs/
│   ├── PRODUCT.md
│   ├── ARCHITECTURE.md
│   └── DATABASE.md           # authoritative data model
├── frontend/                 # Angular 22 SPA (already scaffolded)
└── backend/                  # NestJS application (to be created)
```

Two independent npm projects, no monorepo tooling. A shared types package is
deliberately avoided for the MVP: the frontend declares its own view-model
interfaces mirroring the API contract. Introducing a workspace or shared package is
a reasonable later refactor, but it is not worth the build complexity at this size.

---

## 4. Backend Structure

### 4.1 Directory layout

```
backend/src/
├── main.ts
├── app.module.ts
├── common/                   # cross-cutting, no business logic
│   ├── config/               # typed env config (@nestjs/config + validation)
│   ├── prisma/               # PrismaService + PrismaModule
│   ├── filters/              # global exception filter
│   ├── interceptors/         # logging, response shaping
│   └── dto/                  # pagination, shared primitives
└── modules/
    ├── auth/
    ├── users/
    ├── profiles/
    ├── jobs/                 # canonical job read model + details
    ├── search/               # query, filter, ranking
    ├── saved-jobs/
    ├── sources/              # source adapters behind an interface
    ├── ingestion/            # orchestration of fetch → persist
    ├── normalization/
    ├── deduplication/
    ├── classification/       # experience extraction + junior level
    ├── scoring/              # junior suitability score
    └── health/
```

### 4.2 Layering rules

Every module follows the same internal shape:

```
modules/<name>/
├── <name>.module.ts
├── <name>.controller.ts      # HTTP only: validation, guards, mapping
├── <name>.service.ts         # business logic
├── dto/                      # request DTOs (class-validator) + response DTOs
└── <name>.service.spec.ts
```

Rules enforced by review:

- Controllers contain no business logic. They validate input, call one service
  method, and map the result to a response DTO.
- Prisma types never leave a service. Controllers return response DTOs, so the API
  contract is decoupled from the database schema.
- Domain modules (`jobs`, `search`, `classification`, …) must never import from
  `sources/`. The dependency arrow points one way only.

### 4.3 Module dependency graph

```
              ┌──────────────────────────────────────────────┐
              │                  ingestion                    │
              │  (orchestrator — the only module that knows   │
              │   the whole pipeline)                         │
              └───┬─────────┬──────────┬───────────┬──────────┘
                  │         │          │           │
              sources  normalization  dedup   classification
                                                    │
                                                 scoring

   auth ──► users ──► profiles          search ──► jobs ◄── saved-jobs
                                                    ▲
                                        (reads canonical jobs written
                                         by the ingestion pipeline)
```

`ingestion` depends on the pipeline modules; the pipeline modules do not depend on
each other except `classification → scoring`. The read side (`search`, `jobs`,
`saved-jobs`) never touches the pipeline — it only reads the canonical tables.

---

## 5. Data Model (PostgreSQL / Prisma)

### 5.1 Three-level job model

Deduplication requires distinguishing *a listing* from *a vacancy*. The model
therefore has three levels:

| Model            | Meaning                                            | Cardinality              |
| ---------------- | -------------------------------------------------- | ------------------------ |
| `RawJobDocument` | Immutable payload exactly as returned by a source   | 1 per fetch              |
| `JobPosting`     | Normalized listing from one source                  | 1 per source listing     |
| `Job`            | Canonical vacancy shown to users                    | 1 per vacancy, N postings |

`RawJobDocument` exists so normalization and classification can be re-run on
historical data after a logic change without re-fetching from sources — important
both for iteration speed and for respecting source rate limits. Its cost is
storage; the trade-off is accepted, with a retention policy (§5.5).

### 5.2 Schema

The full schema — every model, field, constraint, index, and the raw SQL that
Prisma cannot express — lives in **`docs/DATABASE.md`**, which is the authoritative
description of the data model. It supersedes the schema sketch that previously
appeared in this section.

What that document settles, and this section no longer restates:

| Area | See |
| ---- | --- |
| Full Prisma schema and enums | `DATABASE.md` §3 |
| What the MVP schema deliberately omits (D7) | `DATABASE.md` §3.4 |
| Classification evidence and score naming | `DATABASE.md` §4 |
| Generated `tsvector`, partial indexes, CHECK constraints | `DATABASE.md` §5 |
| Canonical slugs for company, title, technologies | `DATABASE.md` §6 |
| Index inventory, with the query each one serves | `DATABASE.md` §7 |
| Retention and cascade behaviour | `DATABASE.md` §8 |

The structural commitments that constrain the rest of this document:

- **`Job.dedupHash` is `UNIQUE`.** The database, not the application, guarantees
  one canonical job per vacancy. Ingestion treats the constraint violation as a
  race to retry (§6.3).
- **`Job.mergedIntoJobId`** redirects a job merged into another, so correcting a
  false split never orphans a `SavedJob`. Search filters `mergedIntoJobId IS NULL`.
- **`Job` and `JobPosting` carry a non-null `language`** (ISO 639-1, default `en`).
  English and German are supported from day one; this drives both full-text search
  (§5.4) and the rule-based classifier (§6.4).
- **`User.role`** is `USER` or `ADMIN`, and guards the manual ingestion trigger
  (§6). No administrative UI is part of the MVP.
- **The current classification is denormalized onto `Job`** — `juniorLevel`,
  `juniorScore`, `requiredMinYears`, `requiredMaxYears` — so search filters and
  sorts without a join (§8.1).
- **`RawJobDocument` is keyed by content hash**, so an unchanged re-fetch writes no
  row. This is what keeps the 90-day retention policy affordable (§5.5).

- **Salary, company entities, job taxonomy, and application tracking are not in
  the MVP schema** (D7). Salary in particular is not captured at all — it stays
  unparsed inside `description`, so §6.2 has no salary stage and §8.1 has no salary
  parameter. `DATABASE.md` §3.4 records the exclusions and their cost.

Technologies are PostgreSQL `String[]` with a GIN index in the MVP; there is no
`Technology` table. Primary keys are UUIDs throughout.

### 5.3 Signal shape

`positiveSignals` / `negativeSignals` store an array of:

```ts
interface Signal {
  code: string;      // "ZERO_TO_TWO_YEARS", "REQUIRES_3_PLUS_YEARS", "TEAM_LEAD"
  weight: number;    // contribution to the score
  evidence: string;  // verbatim excerpt from the description
}
```

Storing the verbatim excerpt is what makes the explanation in `PRODUCT.md` §7
possible, and what lets a bad classification be debugged after the fact. JSON is
used rather than a table because signals are only ever read as a whole alongside
their classification — they are never queried independently.

This shape is deliberately minimal and is **not** specified further at this stage.
It is validated in code at the classifier boundary, not by a database constraint,
and because it is JSON it can gain fields without a migration — so additional
structure is added when a classifier actually needs it, not in advance. The
verbatim `evidence` is the one part that is not negotiable (`DATABASE.md` §4.1).

### 5.4 Full-text search

Search is PostgreSQL-native. No Elasticsearch in the MVP.

- A generated `tsvector` column on `Job` over `title` (weight A), `companyName`
  (weight B) and `description` (weight C), with a GIN index.
- The vector is **language-aware**: `Job.language` selects the `german` or
  `english` text-search configuration, so German postings stem correctly. English
  is the fallback for any other detected language.
- The `pg_trgm` extension for fuzzy company/title similarity during deduplication.
- Both are added through a Prisma migration containing raw SQL, since Prisma does
  not model generated tsvector columns; the column is declared `Unsupported` in the
  schema and queried with `$queryRaw` from a single repository method.

Queries must select the same configuration as the write side — searching a German
posting with the English configuration silently drops results through stemming
mismatches rather than failing loudly. Both sides derive it from `Job.language`.
The exact SQL is in `DATABASE.md` §5.

This is the one place raw SQL is acceptable, and it stays confined to
`search/search.repository.ts`.

### 5.5 Retention

- `RawJobDocument`: keep 90 days, then delete (scheduled cleanup job).
- `Job` / `JobPosting`: a posting no longer seen in consecutive successful runs of
  its source ages out via `lastSeenAt` and is excluded from search results after
  45 days. Rows are not deleted, so saved jobs never dangle.
- `Job` rows merged into another are retained with `mergedIntoJobId` set and
  excluded from search, so a `SavedJob` pointing at one still resolves.
- `RefreshToken`: deleted once expired for more than 30 days.

Only `RawJobDocument` and `RefreshToken` are hard-deleted; everything a user can
reach is soft-deactivated. Full rules and cascade behaviour: `DATABASE.md` §8.

---

## 6. Ingestion Pipeline

```
  ┌──────────┐   ┌───────────┐   ┌─────────────┐   ┌──────────┐   ┌──────────────┐   ┌─────────┐
  │  Source  │──►│    Raw    │──►│  Normalize  │──►│  Dedupe  │──►│   Classify   │──►│  Score  │
  │ Adapter  │   │ persisted │   │ → JobPosting│   │ → Job    │   │ → evidence   │   │ → 0-100 │
  └──────────┘   └───────────┘   └─────────────┘   └──────────┘   └──────────────┘   └─────────┘
```

`IngestionService` orchestrates the stages for one source at a time, records an
`IngestionRun`, and isolates failures: one failing source must never abort the
others. Each stage is a service taking a typed input and returning a typed output,
which makes every stage unit-testable with fixtures and no database.

Scheduling uses `@nestjs/schedule` inside the API process, plus an HTTP trigger for
manual runs during development, guarded by a role check against `User.role ==
ADMIN` (§9). The role guards that one route; no administrative UI is part of the
MVP.

### 6.1 Source adapters

Every integration implements one interface:

```ts
export interface JobSourceAdapter {
  readonly descriptor: SourceDescriptor;
  fetchJobs(params: SourceFetchParams, ctx: FetchContext): AsyncIterable<RawJob>;
}

export interface SourceFetchParams {
  query?: string;
  location?: string;
  since?: Date;
  limit: number;
}

export interface FetchContext {
  readonly runId: string;
  readonly signal: AbortSignal;   // run budget exhausted, or shutdown
  readonly logger: Logger;        // pre-tagged with sourceKey + runId
}

export interface RawJob {
  externalId: string;   // stable within this source, permanently
  url: string;          // absolute https URL of the original posting
  payload: unknown;     // stored verbatim in RawJobDocument
  postedAt?: Date;      // only when the source states it — enables the `since` early-stop
}
```

`fetchJobs` returns an **`AsyncIterable`, not a `Promise<RawJob[]>`**. Returning an
array would force every adapter to run its own pagination loop and hold a full
result set in memory, putting the loop — where rate-limit and stop-condition
mistakes actually happen — in per-source code that gets the least review. Streaming
gives the orchestrator ownership of backpressure, the page cap, and early
termination; adapters implement a single page and the shared base drives it.

Compliance metadata is not prose. Every adapter carries a machine-readable
descriptor, the executable twin of the header comment §7.3 requires:

```ts
export interface SourceDescriptor {
  readonly key: string;                     // matches JobSource.key
  readonly displayName: string;
  readonly accessMethod: AccessMethod;      // §7.1 — no scraping value exists
  readonly termsUrl: string;                // the terms permitting this access
  readonly attributionText?: string;        // when the source requires attribution
  readonly complianceNote: string;          // why this method is permitted here
  readonly ordering: 'RECENT_FIRST' | 'UNSPECIFIED';
  readonly volatilePayloadPaths?: string[]; // excluded from RawJobDocument.contentHash
  readonly defaults: { rateLimitRps: number; pageSize: number; maxPages: number };
}
```

Registration validates the descriptor and **refuses to boot** on a missing
`accessMethod`, `termsUrl`, or `complianceNote`, so §7.3 is enforced by the
application rather than by reviewer memory. Compliance fields are authoritative in
code and synced one-directionally into `JobSource`; only `JobSource.enabled` is
owned by the database, so a misbehaving source can be stopped without a deploy.

Adapters are registered in a `SOURCE_ADAPTERS` injection token array, so adding a
source is one new directory plus one provider entry. Nothing outside `sources/` may
import a concrete adapter or reference a source-specific field name.

Adapters never call the network directly: they receive a shared HTTP client that has
already applied the User-Agent, rate limiting, retry policy, timeout, and error
classification, so no adapter can accidentally bypass §7's guardrails.

Which sources may be integrated, and by what access method, is governed by §7. That
policy is binding on every adapter and takes precedence over any convenience this
interface offers.

### 6.2 Normalization

`NormalizationService` converts a source-specific payload into a `JobPosting`
shape. Responsibilities:

- HTML → plain text (strip markup, preserve paragraph and list breaks)
- Whitespace and unicode normalization
- Company name normalization → `companySlug` (lowercase, strip legal suffixes such
  as GmbH / Ltd / Inc, strip punctuation)
- Location parsing → `location` + ISO `countryCode`
- Workplace type detection (remote / hybrid / onsite)
- Employment type detection, including internship and working-student, which matter
  for this audience
- Technology extraction against a curated skill dictionary → `technologies[]`
- Language detection → ISO 639-1 `language`, which selects the text-search
  configuration (§5.4) and the classifier's pattern set (§6.4)

There is **no salary stage**. D7 excludes salary from the MVP schema entirely
(`DATABASE.md` §3.4), so any salary text a posting contains stays inside
`description`, unparsed.

Normalization is deliberately dictionary- and rule-driven rather than AI-driven: it
must be fast, deterministic, and cheap, because it runs on every posting on every
run.

### 6.3 Deduplication

Three tiers, cheapest first:

1. **Source identity.** `@@unique([sourceId, externalId])` — re-ingesting the same
   listing updates it rather than creating a duplicate. This absorbs the majority
   of repeat volume.
2. **Exact canonical hash.**
   `dedupHash = sha256(companySlug | normalizedTitle | countryCode)`, where
   `normalizedTitle` is lowercased with seniority words, `(m/f/d)`-style markers and
   punctuation removed. An exact hash match attaches the posting to the existing
   `Job`. The column is `UNIQUE`, so two concurrent runs cannot create competing
   canonical jobs; the losing insert catches the constraint violation and retries as
   a match. `normalizedTitle` is stored, not only hashed, because tier 3 needs it.
3. **Fuzzy match.** Only for postings unmatched by tier 2, and only within the same
   `companySlug`: `pg_trgm` similarity on the normalized title above a tuned
   threshold, confirmed by a description similarity check. Confidence below the
   threshold creates a new `Job` — a false split is a far cheaper error than a false
   merge, which would hide a real vacancy from the user.

When postings merge into one `Job`, the canonical field values are taken from the
posting with the richest description; every source URL stays reachable through the
`postings` relation, so the UI can show "also listed on N sources".

Because tier 3 is biased toward splitting, false splits are expected and must stay
correctable. Merging two existing `Job` rows sets `mergedIntoJobId` on the loser
rather than deleting it, so search excludes it (`mergedIntoJobId IS NULL`) while any
`SavedJob` pointing at it still resolves through the redirect.

### 6.4 Classification

Two collaborating classifiers behind one interface, so the LLM is an enhancement
rather than a dependency:

```ts
export interface JuniorClassifier {
  readonly version: string;
  classify(input: ClassificationInput): Promise<ClassificationResult>;
}
```

**Stage 1 — `RuleBasedClassifier` (always runs).**
Pattern extraction over the normalized description, in **English and German from
day one** — the pattern set is selected by `JobPosting.language`:

- Experience ranges: `0–1`, `0-2`, `1+`, `3+`, `at least 5 years`,
  `mindestens 3 Jahre` and equivalent phrasings → `minYears` / `maxYears`
- Positive phrases: entry level, recent graduates welcome, no experience required,
  training provided, career starter, Berufseinsteiger
- Negative phrases: senior responsibilities, lead a team, team management,
  extensive production experience, `N+ years` where N ≥ 3

Each match emits a `Signal` with a weight and the verbatim excerpt. The title is one
input among many and never decides the outcome alone — per `CLAUDE.md`, a "Junior"
title with `5+ years` in the body classifies as `EXPERIENCED`. That case is the
product's reason to exist, so it is a rule, not a heuristic.

**Stage 2 — `AiClassifier` (optional, feature-flagged).**
Runs only when stage 1 returns `AMBIGUOUS`, or when title and body disagree. It
receives the normalized description and must return a structured, schema-validated
result carrying the same `Signal` shape with verbatim evidence — free-form prose is
rejected. Cost stays bounded because it is a fallback, not the default path.
Results are cached by content hash, so re-classification of unchanged text is free.

Precedence: explicit numeric evidence beats phrase evidence beats title. Both
classifiers write a `JobClassification` row under their own `classifierVersion`; the
row used for display is flagged `isCurrent` and denormalized onto `Job`. Because
versions are retained, a classifier change can be evaluated against past jobs before
being promoted.

The cache key is `JobClassification.inputHash` — the hash of the text that was
classified. It both lets unchanged text skip re-classification and lets a job whose
description changed keep the old and the new result under one `classifierVersion`.
A partial unique index enforces exactly one `isCurrent` row per job.

### 6.5 Scoring

`ScoringService` maps a `ClassificationResult` to a 0–100 **junior suitability
score**: a band derived from the `JuniorLevel`, adjusted within that band by signal
weights and evidence strength. It is deterministic and pure, therefore trivially
unit-testable.

#### What the score means

The score is a **junior suitability score**. It answers exactly one question:

> Based on the evidence in this posting, how well do its stated requirements match a
> candidate with roughly 0–2 years of experience?

It is a property of **the posting**, derived only from the text of the posting. It
is not a property of the user, and it says nothing about the user's chances.

#### What the score is not

It is **not** a probability of being hired, and must never be presented, labelled,
described, or documented as one. It is also not:

- a likelihood of getting an interview or a response;
- a prediction about the outcome of an application;
- a measure of the user's qualification, skill, or competitiveness;
- a judgment of the job's quality, the employer, or the compensation.

Hiring outcomes depend on the applicant pool, the recruiter, timing, and much else
this system cannot observe. Claiming otherwise would mislead users about decisions
that matter to them, so this constraint is a product requirement, not a stylistic
preference — it comes from `CLAUDE.md` and `PRODUCT.md` §8.

#### How this is enforced

| Layer | Rule |
| ----- | ---- |
| Data model | The field is `Job.juniorScore` / `JobClassification.score`, alongside `JuniorLevel`. Never named `probability`, `chance`, `likelihood`, `successRate`, or `matchProbability`. |
| API | Exposed as `juniorScore` with `juniorLevel` and the signal evidence. Response DTOs never present it as a predicted outcome. |
| UI | Labelled **"Junior Match"** and always rendered together with `signal-list`, so the evidence that produced it is visible (§10). Never a bare percentage, never phrasing like "94% chance". |
| Copy | Any explanatory text describes suitability — *"this role's stated requirements fit an entry-level candidate"* — never likelihood of being hired. |
| Tests | `junior-score-badge` and `signal-list` tests assert the label and the presence of evidence (§11.2). |

A percentage is easy to misread as a probability, which is why the label and the
adjacent evidence do the disambiguating work. If a future UI cannot show the
evidence next to the number, it should show the `JuniorLevel` band instead of the
number.

#### Personalization

Profile-based personalization (weighting by the user's technologies and locations)
is applied at **query time** in the search module, not baked into the stored score,
so the stored score stays user-independent and cacheable.

---

## 7. Job-Source Acquisition & Compliance

This section is binding on all ingestion work. It constrains *how* job data may be
obtained; it deliberately does not name *which* sources will be used.

### 7.1 Permitted access methods

A source may be integrated only through an access method it explicitly permits:

- a documented public or partner **API**, used within its stated terms;
- an **official feed** published for consumption (RSS/Atom, JSON feed, sitemap-style
  job feeds, structured `JobPosting` data a site publishes for indexing);
- a **data-sharing agreement** or granted API credentials;
- content whose licence or terms of use permit programmatic retrieval and storage.

Anything outside this list is out of scope until it is brought inside it — by
obtaining credentials, agreeing terms, or finding a permitted equivalent.

### 7.2 Prohibited techniques

The application must never, in any adapter or supporting tool:

- bypass or circumvent **authentication** or session controls;
- solve, evade, or outsource **CAPTCHAs** or other bot-detection challenges;
- defeat **access controls**, geo-restrictions, or paywalls;
- ignore or exceed **rate limits**, whether stated in terms, in headers, or by
  documented convention;
- disregard **`robots.txt`** or equivalent crawl directives;
- **disguise the client** — rotating IPs or proxies to evade blocking, spoofing a
  browser User-Agent to appear human, or otherwise misrepresenting the caller;
- scrape a source that prohibits scraping in its terms of use, whether or not it is
  technically possible.

A source being technically reachable is not evidence that access is permitted.
Where terms are ambiguous, the restrictive reading applies.

### 7.3 Adapter requirements

Every adapter under `modules/sources/` must:

1. Carry a **header comment** naming the source, the exact access method used, and
   the terms, licence, or agreement permitting it. An adapter that cannot state this
   is not merged.
2. Send a **truthful, descriptive User-Agent** identifying the application with a
   contact address.
3. Apply **conservative client-side rate limiting** and exponential backoff,
   independent of whatever the source enforces, so the application is a well-behaved
   client even when the source is permissive.
4. Treat `401`, `403`, `429` and block pages as **stop conditions** — logged, ending
   the run for that source. Never as an obstacle to route around.
5. Store only what the product needs: posting content, metadata, and the canonical
   URL back to the original posting.

### 7.4 Attribution and traffic

Every `Job` retains its source URLs through the `postings` relation, and the UI
always links out to the original posting (`PRODUCT.md` §4, item 9). The product is a
discovery and classification layer that sends qualified traffic to sources — it
does not attempt to replace them or to retain users who would otherwise apply at
the origin.

### 7.5 Source selection is decided separately

**Which sources ship is an open decision, out of scope for this document.**

It is a product and legal question, not an architectural one, and it is deliberately
deferred so the architecture is not shaped around any single source. The adapter
interface (§6.1) exists precisely so that this decision can be made — and revised —
without touching the rest of the system.

Selecting a source requires, per source:

1. a review of its terms of use and `robots.txt` against §7.1 and §7.2;
2. identification of the specific permitted access method, and any credentials or
   agreement it requires;
3. a record of that finding, so the decision is auditable later;
4. a check that its data carries what classification needs — most importantly a
   **full description body**, since a source exposing only titles and snippets
   cannot support evidence-based classification and is of little use to this
   product.

Until a source clears that review, it is not integrated. No source name in any
example, fixture, or comment in this repository should be read as a decision that it
will be used. Development before selection proceeds against **local fixtures and a
seeded database** (§12), which is sufficient for building normalization,
deduplication, classification, scoring, search, and the entire frontend.

---

## 8. API Surface

REST, JSON, prefix `/api/v1`. Validation by `class-validator` through a global
`ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true`.

| Method | Path                 | Auth | Purpose                                      |
| ------ | -------------------- | ---- | -------------------------------------------- |
| POST   | `/auth/register`     | –    | Create account                               |
| POST   | `/auth/login`        | –    | Access + refresh token                       |
| POST   | `/auth/refresh`      | –    | Rotate refresh token                         |
| POST   | `/auth/logout`       | JWT  | Revoke refresh token                         |
| GET    | `/users/me`          | JWT  | Current user                                 |
| GET    | `/profiles/me`       | JWT  | Read search profile                          |
| PUT    | `/profiles/me`       | JWT  | Update search profile                        |
| GET    | `/jobs/search`       | opt. | Search + filter (§8.1)                       |
| GET    | `/jobs/:id`          | opt. | Detail incl. evidence + all source URLs      |
| GET    | `/saved-jobs`        | JWT  | List saved jobs                              |
| POST   | `/saved-jobs`        | JWT  | Save a job                                   |
| DELETE | `/saved-jobs/:jobId` | JWT  | Unsave                                       |
| GET    | `/health`            | –    | Liveness / readiness                         |

Search is readable without auth so the product is evaluable before signup;
personalized ranking and saving require a token.

### 8.1 Search query parameters

```
q                text query (title, company, description)
technologies[]   e.g. Java, Spring Boot
locations[]      free text
countryCode      ISO-3166 alpha-2
workplaceType[]  REMOTE | ONSITE | HYBRID
employmentType[] FULL_TIME | INTERNSHIP | ...
juniorLevel[]    ENTRY_LEVEL | LIKELY_ENTRY_LEVEL | ...
minJuniorScore   0–100
maxYearsRequired integer
postedWithinDays integer
sort             relevance | juniorScore | postedAt
page, pageSize   offset pagination (pageSize ≤ 50)
```

Default sort is `relevance`: a weighted blend of text rank, junior score, recency,
and — for authenticated users — profile fit. Per `PRODUCT.md` §8, the default result
set excludes `CLEARLY_EXPERIENCED` and, unless the user opts in, `EXPERIENCED`. The
product optimizes for *"jobs I should realistically consider"*, not for maximum row
count.

Response envelope:

```json
{ "items": [ ... ], "page": 1, "pageSize": 20, "total": 137 }
```

---

## 9. Authentication

- Email + password. Hashing with **argon2id** (bcrypt is an acceptable fallback if
  argon2 native builds cause friction on Windows).
- **Access token**: JWT, ~15 min, carrying `sub` + `email`, verified by a global
  `JwtAuthGuard` with a `@Public()` decorator for opt-out routes.
- **Refresh token**: opaque random string; only its hash is stored in
  `RefreshToken`, rotated on every use and revocable. Rotation makes a stolen
  refresh token detectable and containable.
- Secrets (`JWT_SECRET`, `DATABASE_URL`, source API keys) come from environment
  variables through a validated typed config module. Nothing is hard-coded; `.env`
  is git-ignored with a committed `.env.example`.
- **Authorization**: `User.role` is `USER` or `ADMIN`, defaulting to `USER`. A role
  guard protects the manual ingestion trigger (§6); every other route is either
  public or authenticated. The role is not exposed as a user-facing feature, and no
  admin dashboard, role-management endpoint, or additional role is part of the MVP.
- Global rate limiting via `@nestjs/throttler`, stricter on `/auth/*`.
- CORS restricted to the configured frontend origin.

---

## 10. Frontend Structure

The existing scaffold is Angular 22 with standalone components, SCSS, and
`provideRouter`. The proposed structure keeps that and adds:

```
frontend/src/app/
├── core/                       # singletons, provided once
│   ├── auth/                   # signal-based AuthService, auth guard
│   ├── api/                    # typed HTTP clients: jobs, profiles, saved-jobs
│   ├── models/                 # API contract interfaces
│   └── interceptors/           # JWT attach, error, refresh-on-401
├── features/                   # lazy-loaded routed feature areas
│   ├── auth/                   # login, register
│   ├── search/                 # search page, filter panel, result list
│   ├── job-detail/             # detail + classification explanation
│   ├── saved-jobs/
│   └── profile/
├── shared/                     # reusable presentational components
│   ├── job-card/
│   ├── junior-score-badge/
│   ├── signal-list/            # renders positive signals / concerns
│   └── ui/                     # button, input, chip, empty-state, spinner
└── app.routes.ts
```

Conventions:

- Standalone components only; every feature route is lazy-loaded via
  `loadComponent` / `loadChildren`.
- State via Angular signals in feature-scoped services. No NgRx for the MVP — the
  state is a search query, a result page, and a saved-job set.
- `HttpClient` with a functional interceptor attaching the access token and
  transparently refreshing once on 401.
- Search filters are mirrored into URL query params, so a search is shareable and
  survives reload; the search service derives its request from the route.
- `junior-score-badge` and `signal-list` always render together on a result card:
  the score is never shown without the evidence that produced it, and its label is
  "Junior Match", never a hiring likelihood.

---

## 11. Testing Strategy

**Decided: Jest on the backend, Vitest on the frontend.** The two projects are
independent npm packages that are never built or tested together, so a single
shared runner buys nothing. Jest is the NestJS default and is what `@nestjs/testing`
is built around; Vitest is what the Angular 22 scaffold already ships via
`@angular/build:unit-test`. This resolves the deviation from `CLAUDE.md`, which
names Jest generally — Jest remains the choice everywhere its ecosystem applies,
and the frontend keeps its toolchain default rather than fighting the Angular
builder.

### 11.1 Backend — Jest with `@nestjs/testing`

| Area                        | Type                                   | Priority |
| --------------------------- | -------------------------------------- | -------- |
| Experience extraction       | Unit, fixture-based                    | Highest  |
| Junior classification       | Unit, fixture-based                    | Highest  |
| Scoring                     | Unit, pure                             | Highest  |
| Normalization               | Unit, fixture-based                    | High     |
| Deduplication               | Unit + integration                     | High     |
| Auth (hashing, tokens, guards) | Unit + e2e                          | High     |
| API validation              | e2e via supertest                      | High     |
| Search filters              | Integration                            | Medium   |
| Source adapters             | Unit against recorded fixtures — never live HTTP in tests | Medium |

The classification suite is a corpus of real anonymized job descriptions with
expected `JuniorLevel` outcomes, including the adversarial cases the product exists
to catch: `"Junior Developer"` in the title with `"5+ years required"` in the body,
and the reverse. This corpus is the regression net for the core value proposition
and grows with every misclassification found in production.

### 11.2 Frontend — Vitest via `@angular/build:unit-test`

Run with the existing `npm test` in `frontend/`. Coverage focuses on:

- `core/auth` — token handling, guard behaviour;
- `core/interceptors` — token attachment and the refresh-on-401 path;
- `core/api` — request construction, especially search filter serialization;
- `shared/junior-score-badge` and `shared/signal-list` — that a score never renders
  without its evidence, and that its label is correct (§6.5).

Component tests use Angular's standard testing utilities under the Vitest runner.

---

## 12. Configuration & Operations

Per "How to read this document", this section is a **target state, not a setup
checklist**. Each variable and each operational concern is added when the feature
that needs it is built: `DATABASE_URL` and `JWT_*` are needed by the first vertical
slice, whereas `INGESTION_CRON` matters only once ingestion is scheduled, and
`ANTHROPIC_API_KEY` only if the AI classifier stage is adopted at all. Adding the
whole list up front produces configuration the application does not read.

Environment variables, validated at boot — the app refuses to start if a variable it
actually uses is missing or malformed:

```
DATABASE_URL
JWT_SECRET
JWT_ACCESS_TTL
JWT_REFRESH_TTL
PORT
CORS_ORIGIN
INGESTION_ENABLED           # off by default in development
INGESTION_CRON
AI_CLASSIFIER_ENABLED       # feature flag for §6.4 stage 2
ANTHROPIC_API_KEY           # only required when that flag is on
```

Local development runs PostgreSQL in Docker Compose, with backend and frontend on
the host. Migrations are Prisma-managed and committed. A seed script provides a demo
user and a fixture job set, so the frontend is developable without running ingestion.

Structured JSON logging with a request id. Errors are normalized by a global
exception filter into `{ statusCode, message, error, requestId }`; internal errors
never leak stack traces or Prisma messages to clients.

---

## 13. Future SaaS Evolution

Not to be implemented during the MVP. Recorded so today's decisions do not block
tomorrow's.

| Future capability | What today's design already provides |
| ----------------- | ------------------------------------ |
| Job alerts, daily recommendations | `Profile` already stores the query shape; alerts become a scheduled job reusing `SearchService` |
| CV-to-job matching, skill-gap analysis | `Job.technologies[]` plus stored classification evidence are the matching substrate; a `CvDocument` model attaches to `User` |
| Personalized matching | Profile-fit scoring already lives at query time rather than in the stored score, so per-user ranking is additive |
| Subscriptions and billing | `User` gains a `plan` field plus a billing module; entitlement checks fit as a guard, since all business logic already lives in services |
| Application tracking | A new `Application` model referencing `Job` — `SavedJob` is its natural precursor |
| Scale-out | `ingestion` is already isolated behind service interfaces: point its module at a queue-backed worker process and the API keeps serving reads unchanged |
| Search growth | Query building is confined to `search.repository.ts`; swapping PostgreSQL FTS for a search engine touches one file |
| Salary display and filtering | Excluded from the MVP by D7 (`DATABASE.md` §3.4). Adding it is one migration plus a normalization stage, but it cannot be backfilled past the 90-day raw-document window |
| Company entities, job taxonomy, application tracking | Also excluded by D7. `companySlug`, `technologies[]`, and `SavedJob` are the respective extraction points |
| Recruiter accounts, company dashboards | `User.role` already provides the role dimension. The tenant dimension and any administrative UI remain deliberately deferred, since retrofitting them later is cheaper than carrying unused multi-tenancy through the MVP |

The monolith stays a monolith until a specific measured pressure justifies splitting
it. The module boundaries above are the seams along which it would split.

---

## 14. Open Questions

1. **Which sources ship first.** Deferred by design — see §7.5. The adapter
   interface is source-agnostic, so this is a product and legal decision that can be
   made in parallel with implementation. It blocks live ingestion only; every other
   part of the system, including the full frontend, can be built and tested against
   fixtures until it is resolved.
2. **Fuzzy dedup threshold.** The `pg_trgm` similarity cutoff must be tuned against
   real data; the initial value will be a conservative guess biased toward splitting
   rather than merging.
3. **AI classifier in the MVP.** The design makes stage 2 optional. Whether it ships
   in v1 or the MVP runs on rules alone is a cost/quality call to be made once
   rule-based accuracy is measured against the test corpus.
4. **Language detection library.** English and German support is settled (§5.4), but
   the detector that populates `language` is not chosen. Any library returning ISO
   639-1 codes fits.
5. **Which queries ingestion runs.** `SourceFetchParams` carries `query` and
   `location`, but ingestion is a background crawl with no user request to take them
   from, and nothing yet specifies who supplies them. The proposal is a curated
   per-source **ingestion plan** — a list of `{ query, location }` seeds aimed at
   junior-relevant roles — with `since` derived from the last successful run's
   `startedAt` minus a small overlap window. This blocks ingestion **orchestration**
   (M5.4), not the adapter interface or the HTTP layer (M5.1–M5.3).

**Resolved.** *Multilingual descriptions* — the MVP supports **English and German
from day one**, rather than restricting to English. This is settled in the data
model (`DATABASE.md` §5.1) because the full-text search configuration is baked into
a generated column and is expensive to change later. The rule-based classifier
carries German patterns from the start (§6.4).

**Resolved.** *Source adapter shape* — `fetchJobs` streams via `AsyncIterable`
rather than returning `Promise<RawJob[]>`, and compliance metadata moves onto a
validated `SourceDescriptor` that the application refuses to boot without (§6.1).

**Resolved.** *MVP schema scope* — salary, company entities, job taxonomy, and
application tracking are excluded from the MVP schema (D7, `DATABASE.md` §3.4). This
revises the earlier D7, which had specified structured salary fields.
