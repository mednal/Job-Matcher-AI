# JuniorJob AI — Job Source Review Register

Status: living document
Scope: the auditable record required by `docs/ARCHITECTURE.md` §7.5
Governed by: `docs/ARCHITECTURE.md` §7 (binding), `CLAUDE.md`

## What this document is

`ARCHITECTURE.md` §7.5 requires that every source considered for integration is
reviewed against the compliance policy, and that **the finding is recorded so the
decision is auditable later**. This file is that record.

It exists for two reasons:

1. **Auditability.** If asked why a source is integrated, the answer is a dated
   entry naming the access method and the terms permitting it — not someone's
   recollection.
2. **Rejections are durable.** A source reviewed and rejected stays rejected. Without
   a written record, the same source gets re-proposed and re-litigated every few
   months, and eventually someone approves it without repeating the review.

**No entry here is an implementation commitment.** A source clearing review becomes
*eligible* for an adapter; whether one is built is a separate scheduling decision.

## Review checklist

Per `ARCHITECTURE.md` §7.5, a source cannot be integrated until every box is
answered. An unanswered box is a rejection, not a pending item.

- [ ] **Terms of use reviewed** against §7.1 (permitted access methods) and §7.2
      (prohibited techniques). Where terms are ambiguous, the restrictive reading
      applies.
- [ ] **`robots.txt` reviewed**, where the access method touches site-published
      resources.
- [ ] **Specific permitted access method identified** — one of `PUBLIC_API`,
      `PARTNER_API`, `OFFICIAL_FEED`, `DATA_AGREEMENT`, `LICENSED_CONTENT`. There is
      deliberately no value for scraping, and none may be added.
- [ ] **Credentials or agreement identified**, including who holds them and how they
      are provisioned per environment.
- [ ] **Attribution requirements identified**, and whether the terms mandate specific
      wording or link treatment.
- [ ] **Rate limits identified** — stated in terms, in headers, or by documented
      convention. Our client-side limit must be at least as restrictive.
- [ ] **Full description body confirmed available.** A source exposing only titles
      and snippets cannot support evidence-based classification and is of little use
      to this product (§7.5.4). This is the check most likely to disqualify an
      otherwise-permitted source.
- [ ] **Finding recorded below**, dated, with the reviewer named.

## Reviewed sources

*No sources have been reviewed yet.*

Per `ARCHITECTURE.md` §7.5, source selection is deliberately deferred and is a
product and legal decision rather than an architectural one. Development proceeds
against `FixtureSourceAdapter` and a seeded database until a source clears review;
that is sufficient for normalization, deduplication, classification, scoring,
search, and the entire frontend.

Nothing in this repository — no example, fixture, comment, or test name — should be
read as a decision that a particular source will be used.

## Entry template

Copy this block per source. Keep rejected entries permanently; do not delete them.

```markdown
### <source name>

| Field | Value |
| ----- | ----- |
| Status | ELIGIBLE / REJECTED / NEEDS AGREEMENT |
| Reviewed on | YYYY-MM-DD |
| Reviewed by | <name> |
| Access method | PUBLIC_API / PARTNER_API / OFFICIAL_FEED / DATA_AGREEMENT / LICENSED_CONTENT |
| Terms URL | <url> |
| robots.txt | <url, or N/A with the reason> |
| Credentials | <what is required, who holds them> |
| Attribution required | <exact wording, or none> |
| Stated rate limit | <limit, and where it is documented> |
| Full description body | YES / NO |
| Adapter key | <matches SourceDescriptor.key, once built> |

**Finding.** <Why this access method is permitted for this source, in prose. For a
rejection, what specifically disqualified it — this is what stops the source being
re-proposed later.>
```
