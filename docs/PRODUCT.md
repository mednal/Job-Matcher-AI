# JuniorJob AI — Product Specification

<!-- impeccable:product-schema 1 -->

## Platform

web

---

## 1. Product Vision

JuniorJob AI helps junior software developers find job opportunities that are genuinely suitable for entry-level candidates.

The problem is not simply that jobs are spread across different websites.

The bigger problem is that job titles and search filters are unreliable.

A job may contain "Junior" in its title while requiring three or five years of professional experience.

JuniorJob AI should identify this difference.

---

## 2. Target User

The initial target user is:

* Junior software developer
* Recent computer science graduate
* Entry-level software engineer
* Developer with approximately 0–2 years of experience

The initial product focuses on software-development jobs.

There is **no geographic restriction**. JuniorJob AI is a global search surface: jobs are
aggregated from every supported source regardless of country, and the user narrows the
result set by location, country and posting language through filters, the way a general
job board does. Examples elsewhere in this document that name a single country are
illustrations of one search, not a statement of market scope.

---

## 3. Main User Problem

A user currently needs to:

1. Open multiple job websites.
2. Search each website separately.
3. Repeat similar filters.
4. Open many job descriptions.
5. Determine whether each job is genuinely junior.
6. Discover that many "junior" jobs actually require significant experience.

JuniorJob AI should reduce this work.

---

## 4. Core User Experience

The user should be able to:

1. Create an account.
2. Create a basic job-search profile.
3. Search for jobs.
4. Select relevant job preferences.
5. See jobs from supported sources.
6. See a junior suitability score.
7. Understand why the job was classified as suitable or unsuitable.
8. Filter results.
9. Open the original job posting.
10. Save interesting jobs.

---

## 5. Example Search

A user might search for:

Job:
Java Developer

Location:
Germany

Experience:
0–2 years

Workplace:
Remote or Hybrid

Technologies:
Java
Spring Boot
PostgreSQL

The system should return relevant jobs and rank/filter them based on junior suitability.

---

## 6. Junior Classification

A job should not be considered junior merely because the title contains "Junior".

The system should analyze the job description.

Examples of strong positive evidence:

* "No experience required"
* "0–1 years of experience"
* "0–2 years of experience"
* "Recent graduates welcome"
* "Entry-level position"

Examples of negative evidence:

* "3+ years of experience"
* "5+ years of experience"
* "Lead a team"
* "Senior-level responsibilities"
* "Extensive production experience"

The system should preserve evidence supporting its classification.

---

## 7. Example Result

A job could be displayed as:

Junior Java Developer

Company:
Example Company

Location:
Berlin, Germany

Junior Match:
94%

Experience:
0–1 years

Positive signals:

* 0–1 years of experience
* Recent graduates welcome
* Java and Spring Boot required

Potential concerns:

* German B2 required

The user should be able to open the original job posting.

---

## 8. Important Product Principle

The application should optimize for:

"Show me jobs I should realistically consider."

It should not optimize simply for:

"Show me as many jobs as possible."

Quality and relevance are more important than the number of results.

---

## 9. MVP Boundaries

The MVP should NOT include:

* Payments
* Subscriptions
* CV optimization
* Cover letters
* Interview preparation
* Automatic job applications
* Mobile application
* Recruiter accounts
* Company dashboards

Those features may be considered later.

---

## 10. Future Direction

After the MVP is validated, the product may evolve toward personalized career assistance.

Potential future capabilities:

* Personalized job matching
* CV-to-job matching
* Skill-gap analysis
* Job alerts
* Daily recommendations
* Application tracking
* CV improvement
* Cover-letter assistance
* Interview preparation
* SaaS subscriptions

These are future ideas and should not be implemented during the MVP unless explicitly requested.

---

## Positioning

A general job board can only filter on what a posting *declares*: its title, and the
seniority tag the employer selected. JuniorJob AI's claim is that neither is evidence.

The mechanism a neighbouring product cannot truthfully copy without building the same
pipeline:

**Every junior verdict is derived from the description body, never the title, and every
verdict carries the phrases that produced it.**

A posting titled "Junior Java Developer" whose body demands five years is demoted and
shown as demoted, with the offending phrase quoted. A posting with a neutral title whose
body says "recent graduates welcome" is promoted, with that phrase quoted. The user is
never asked to trust a number: they are shown the sentences and can overrule the machine.

The competing filter says *this employer labelled this job entry-level*.
JuniorJob AI says *here is what this job actually asks for, and here is where it says so*.

---

## Operating Context

The situation the product is used in:

* The user is in an active job search, running the same query repeatedly over days or
  weeks across several boards.
* Their real work is triage — deciding which of many postings deserves the fifteen
  minutes an application costs. Most of that time today is spent opening descriptions
  only to discover the job is not junior.
* They are frequently comparing, not browsing: two or three candidate jobs held in mind
  at once.

How the product participates:

* Jobs enter through a pipeline of ingestion → normalization → deduplication →
  classification → scoring, and are only ever read by the user at the end of it. The
  user never sees a raw source document.
* **JuniorJob AI does not host applications.** The user leaves for the original posting
  on the source site to apply. Sending the user away successfully is a completed job,
  not a lost session.
* Saved jobs are the user's working shortlist across sessions, and survive re-ingestion
  and deduplication of the underlying posting.
* The profile stores durable search intent (technologies, locations, workplace
  preference, experience), not a CV.

Surfaces that exist today: search (`/jobs`), job detail (`/jobs/:id`), saved jobs
(`/saved`), profile (`/profile`), authentication (`/auth`). There is an `ADMIN` role for
source and ingestion operations; it has no dedicated interface in the MVP.

---

## Evidence on Hand

What is real, and therefore what future work is allowed to show:

* **The fixture corpus.** `backend/prisma/seed-data.ts` — 10 hand-written jobs covering
  all five `JuniorLevel` bands, in English and German, including the adversarial
  "Junior title / 5+ years body" case, a two-source job, an inactive job and a
  merged-away job. Stamped `classifierVersion = "seed-fixture-1.0"`. These are
  **hand-written fixtures, not classifier output.**
* **The classification corpus** at `docs/CLASSIFICATION-CORPUS.md`.
* **The shipped disclaimer**, already in the application shell and on the search page:
  the junior score describes suitability, "not a prediction of getting hired".

What does **not** exist, and must never be fabricated in interface copy, marketing
surfaces, screenshots or mock data:

* **No live job source is integrated.** `modules/sources/adapters/` contains only
  `fixture`. `docs/SOURCES.md` is the compliance review register and currently holds
  **zero reviewed sources** — no source has been approved, so no source may be named,
  logo'd, or implied as a partner.
* No real employer names, real vacancies, or job counts.
* No users, testimonials, press, case studies, or adoption numbers.
* No classifier accuracy figure, benchmark, or "% match" claim beyond the score the
  classifier actually computes for a given job.
* No brand assets beyond `frontend/src/assets/favicon.ico` — there is no logo, wordmark,
  illustration set or photography.

---

## Product Principles

1. **Suitability over volume.** The product optimizes for "show me jobs I should
   realistically consider", never for the size of the result set. Removing a job the
   user would have wasted time on is a win, not a loss.
2. **Evidence over label.** No junior verdict may rest on a title, a seniority tag, or a
   source's own classification. If the description does not support it, it is not
   claimed.
3. **The verdict is auditable.** Every classification is shown with the phrases that
   produced it — positive signals *and* concerns. The user must always be able to
   disagree with the machine on the machine's own evidence.
4. **The score is suitability, never hire probability.** This is a standing honesty
   constraint on every surface that displays it, not a footnote.
5. **Sources are used only through permitted access.** Compliance (`ARCHITECTURE.md` §7)
   is a product constraint, not an engineering detail: a source that cannot be accessed
   properly is not a source, however valuable its listings would be.

---

## Accessibility & Inclusion

No product-specific accessibility standard has been established yet — recorded as an
open decision below rather than assumed.

One inclusion fact *is* confirmed and binding: **job content is multilingual by design.**
`Job.language` (ISO 639-1) exists in the schema and already drives search-vector
stemming. Any surface that renders a job title, company or description must expect
non-English text, longer strings, and mixed-language result sets on a single page.

---

## Open Product Decisions

Deliberately undecided. Recorded so future work does not silently invent an answer.

1. **Language filter — wanted, not built.** Confirmed 2026-08-25: users must be able to
   filter results by posting language, the way a general job board does. `Job.language`
   exists in the schema, but `SearchQuery` (`backend/src/modules/search/dto/search.query.ts`)
   has no `language` facet and the search filters UI exposes none. This is a real gap
   between intent and implementation.
2. **First real source.** Which job source is reviewed and integrated first is undecided;
   no candidate has cleared the `SOURCES.md` review.
3. **Interface localization.** The interface is English-only today. Whether the UI itself
   is ever translated — as opposed to merely *displaying* multilingual job content — is
   undecided.
4. **Accessibility standard.** No target (WCAG level or otherwise) has been stated.
5. **Audience bar.** Whether this ships to the public, or serves as a portfolio/thesis
   artifact, has not been established. It affects how much claim-free honesty the
   interface owes and how hard the accessibility and i18n bars are set.
