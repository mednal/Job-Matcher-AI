---
target: /jobs search page
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-25T19-34-15Z
slug: frontend-src-app-features-search-search-page-ts
---
# Design Critique — `/jobs` Search Page (JuniorJob AI)

**Method: dual-agent (A: general-purpose sub-agent, design review · B: general-purpose sub-agent, detector + browser evidence)**

⚠️ **Partial evidence note:** Chrome browser automation was unreachable for *both* sub-agents ("extension not connected," 3 retries each) and the CLI detector ran in **degraded regex-only mode** (its own output: "HTML parser modules unavailable... findings are an undercount, not a clean bill of health"). Everything below comes from source reading against PRODUCT.md/DESIGN.md doctrine, not live rendering — breakpoint behavior, focus order and live states are unverified.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | `aria-live` count + "Updating…" note are solid; out-of-range filter values vanish with zero status message |
| 2 | Match Between System and Real World | 4 | UI vocabulary ("Junior Match", "Positive signals") reproduces PRODUCT.md §7 verbatim |
| 3 | User Control and Freedom | 3 | Good chip removal/URL state; sort auto-applies while filters need explicit submit — two interaction models side by side |
| 4 | Consistency and Standards | 4 | One `.ui-*` primitive set used throughout; one breakpoint (40rem) reused verbatim across three files |
| 5 | Error Prevention | 2 | `novalidate` strips native validation from 3 numeric/select fields with nothing replacing it |
| 6 | Recognition Rather Than Recall | 4 | "Filtering by" chip row + pre-filled panel from URL |
| 7 | Flexibility and Efficiency | 3 | Deep-linkable search, profile-seeded defaults; no saved searches |
| 8 | Aesthetic and Minimalist Design | 3 | Doctrine well executed; expanded filter panel surfaces 8 facets at once |
| 9 | Error Recovery | 2 | `.ui-error` retry is good; invalid filter input produces no error at all anywhere |
| 10 | Help and Documentation | 3 | Score meaning explained inline; adequate for Operate mode |
| **Total** | | **31/40** | **Good** |

## Design Specificity Verdict

**LLM assessment:** Structurally built for the evidentiary thesis, not skinned onto a generic template — the job card's two-column grid exists so the score badge can span rows; the signal list renders verbatim posting text in serif italic behind a rule with typographic quotes; the contradiction banner uses Refuse red instead of Caution deliberately, per PRODUCT.md calling it "the single most useful line in the product." The two-voice type split is carried correctly through every component read.

**Deterministic scan:** Zero CLI findings across search + shared components, but the detector self-reported degraded coverage (no CSS parsing, no contrast checks) — treat as no findings surfaced, not confirmed clean.

**Visual overlays:** None — browser injection never ran.

## Overall Impression

The system's own doctrine is genuinely followed at the component level. The gap isn't taste, it's a data-integrity seam: the filter form has one path that works reliably for simple fields and silently breaks for two others, undermining the same "auditable, honest interface" the rest of the surface projects.

## What's Working

- **`junior-score-badge`'s evidence gating**: `shownScore` checks `!== null` rather than truthiness, so a legitimate `0` still renders.
- **The contradiction banner**: correct semantic color (Refuse), actual years quoted, glyph correctly `aria-hidden`.
- **The Still Layout Rule in practice**: refetches show a quiet `aria-live` "Updating…" note instead of a spinner replacing the list.

## Priority Issues

**[P1] "Where" field silently drops unsubmitted text on Search**
- Why it matters: PRODUCT.md's own worked example pairs a role with a location. The location tag-field only commits text via Enter/Add; the Search button never reads its draft text, so results silently widen with zero feedback.
- Fix: commit any live draft text in each multi-value field on form submit, or auto-add on blur.
- Suggested command: /impeccable harden

**[P1] Out-of-range filter values vanish without any error**
- Why it matters: min-score/max-years/posted-within sit in a `novalidate` form with nothing replacing native validation; out-of-bounds values are silently dropped on URL re-parse, against the system's own `aria-invalid` discipline used elsewhere.
- Fix: validate these fields client-side and drive `aria-invalid` + inline error.
- Suggested command: /impeccable harden

**[P2] Inconsistent semantic grouping inside the filter panel**
- Why it matters: some groups are `<fieldset><legend>`, others bare `<div>`s with no heading — a screen-reader gap.
- Fix: wrap remaining groups in fieldsets or add accessible headings.
- Suggested command: /impeccable clarify

**[P2] Result-row spacing doesn't match the documented rhythm**
- Why it matters: `.search__results` uses 1rem gap; DESIGN.md states "1.5rem between result rows."
- Fix: change to var(--space-5).
- Suggested command: /impeccable polish

**[P3] Save-toggle's Verdict Blue use isn't in the Named Rule's exception list**
- Why it matters: documentation completeness gap in the One Verdict Rule.
- Fix: add save-toggle to the rule's exception list in DESIGN.md, or restyle.
- Suggested command: /impeccable document

## Persona Red Flags

**Jordan (First-Timer)**: Location silently never applies on Search, no feedback. Filter panel housing the core differentiator is collapsed by default on first visit.

**Sam (Accessibility-Dependent)**: Strong `aria-pressed`/`aria-label`/`role` coverage elsewhere, but ungrouped fieldset-less fields and zero auditory feedback on rejected values.

**Riley (Stress-Tester)**: Surface generally hardened (malformed params drop individually, controls disable during load, `0` score renders correctly); the one real find is the same silent-drop bug from a different angle.

## Minor Observations

- Tech chips and filter chips both use tone="brand" — sanctioned by DESIGN.md, worth watching at scale.
- Save toggle sits between score badge and contradiction banner in DOM order, interrupting the "verdict then evidence" read sequence.
- Pagination is Previous/Next only; recovering from accidental "Next" spam costs equally many "Previous" clicks.

## Questions to Consider

1. Chips + wash-tinted badge can all appear on one card — is Verdict Blue's rarity actually preserved at that density?
2. The filter panel holding the core differentiator is collapsed by default — right call, or does it bury the thesis?
3. "What" submits on Search; "Where" requires explicit Add/Enter first — deliberate, or drift the system's consistency doctrine was meant to prevent?
