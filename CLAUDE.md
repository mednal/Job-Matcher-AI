CLAUDE.md# JuniorJob AI

## Product

JuniorJob AI is a job discovery platform primarily designed for junior software developers.

The main problem we solve is that job seekers search across multiple sources and often encounter jobs that appear to be junior but actually require significant professional experience.

The core product value is:

> Help junior developers find jobs that are genuinely suitable for entry-level candidates.

The application will aggregate jobs from supported and legally/technically accessible sources, normalize them, deduplicate them, analyze their experience requirements, and provide a junior suitability score.

---

## MVP

The first version should focus on:

* User authentication
* User profile
* Job search
* Job ingestion from supported sources
* Job normalization
* Job deduplication
* Junior-job classification
* Junior suitability score
* Explanation of classification
* Job filtering
* Job details
* Saved jobs

Do not implement future features unless explicitly requested.

---

## Technology

Frontend:

* Angular
* TypeScript

Backend:

* Node.js
* NestJS
* TypeScript

Database:

* PostgreSQL

ORM:

* Prisma

Testing:

* Jest and appropriate Angular testing tools

Architecture:

* Modular monolith for the MVP

---

## Architecture Rules

Keep the backend modular.

Business logic belongs in services/modules, not controllers.

Keep external job-source integrations behind abstractions.

The rest of the application must not depend directly on an external source's response format.

Do not introduce microservices unless explicitly requested.

Do not over-engineer the MVP.

---

## Job Sources

Only use job sources that can be accessed through an appropriate and permitted method.

Do not bypass:

* authentication
* CAPTCHAs
* access controls
* rate limits
* paywalls
* robots restrictions
* other technical restrictions

Never hard-code the application around one job source.

---

## Junior Classification

Do not determine whether a job is junior only from its title.

Consider evidence such as:

Positive signals:

* entry level
* recent graduates welcome
* no experience required
* 0 years
* 0–1 years
* 0–2 years
* training provided

Negative signals:

* 3+ years
* 4+ years
* 5+ years
* senior responsibilities
* lead responsibilities
* team management
* extensive professional experience

The classification should distinguish between:

* ENTRY_LEVEL
* LIKELY_ENTRY_LEVEL
* AMBIGUOUS
* EXPERIENCED
* CLEARLY_EXPERIENCED

AI classifications should be structured and evidence-based.

The junior score represents suitability for a junior candidate. It must not be presented as the probability of getting hired.

---

## Coding Rules

Before modifying existing code:

1. Inspect the relevant files.
2. Understand how they are used.
3. Make the smallest appropriate change.

Do not rewrite working code unnecessarily.

Do not make unrelated changes.

Use TypeScript types properly.

Keep functions and modules reasonably small.

Avoid unnecessary dependencies.

Do not hard-code secrets.

Use environment variables for credentials and configuration.

---

## Testing

Important business logic must have tests.

Prioritize testing:

* authentication
* job normalization
* deduplication
* experience extraction
* junior classification
* scoring
* API validation

Run relevant tests after implementation.

---

## Claude Code Workflow

Work incrementally.

For every task:

1. Inspect the relevant code.
2. Explain the implementation approach briefly.
3. Implement only the requested task.
4. Run relevant tests and checks.
5. Report what changed.
6. Report any problems or assumptions.

Do not continue into another feature unless explicitly instructed.
