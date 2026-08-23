# Classification Corpus

**Status:** live (M8.6, 2026-08-23) — the regression net for the core value
proposition.

This document explains what the classification corpus is, what it guarantees, and
how to change it. The corpus itself lives in the backend:

| File | What it holds |
| ---- | ------------- |
| `backend/src/modules/classification/__fixtures__/regression-corpus.ts` | The corpus — full-length anonymized postings with their expected outcome |
| `backend/src/modules/classification/classification-regression.spec.ts` | The runner, executed by `npm test` |

---

## 1. Why it exists

`CLAUDE.md` states the product's reason to exist in one sentence:

> Help junior developers find jobs that are genuinely suitable for entry-level
> candidates.

Everything else in the system — ingestion, normalization, deduplication, search — is
plumbing in service of one judgement: **is this posting actually open to someone
starting out?** That judgement is made by rules, weights and a phrase dictionary that
will keep being tuned, and every tuning change silently changes the answer for
postings nobody re-checked.

The corpus is the check. Each case is a posting a person read and decided about; the
expectations are that decision, written down. A change that makes any case disagree
is a change in what the product tells its users, and the test suite says so before
the change is merged rather than after a user has acted on it.

It is the regression net for the whole of Phase 8: `experience.ts` (M8.1),
`phrase-signals.ts` and `signals.ts` (M8.2), `level-rules.ts` (M8.3), and the
band mapping in `scoring/score-bands.ts` (M8.5) are all exercised through it.

---

## 2. What a case asserts

Every case runs through the real stage — the module's `RuleBasedClassifier`, driving
the real extractors, then the real scorer. Nothing is stubbed, so a failure means the
product's answer moved, wherever in the stage the change was made.

| Assertion | Why it is in the net |
| --------- | -------------------- |
| `level` | The answer a user acts on. |
| `minYears` / `maxYears` | Back the `maxYearsRequired` search filter (M9.2), so a wrong bound hides jobs. |
| `signals` — all present | A right answer reached without its evidence is one rule change away from a wrong one. The level must be **explained** (`PRODUCT.md` §7). |
| `absent` — none present | Pins a rule against over-matching, which is the failure a phrase dictionary drifts into. |
| Verbatim evidence | Every excerpt must occur in the description exactly. A quote the posting does not contain is a fabricated explanation. |
| One signal per code | Repetition must not outweigh evidence. |
| Score inside its level's band | End to end through M8.5: the number and the band can never contradict each other. |

The runner also asserts things about the **corpus itself** — every level covered in
both languages, adversarial cases in both directions, at least four ambiguous cases,
every description a full posting rather than a one-liner — so a future edit cannot
quietly reduce it to the cases that happen to pass.

---

## 3. What it covers

23 cases, English and German, grouped by what they are for.

**Adversarial — the product's reason to exist.** A "Junior Java Developer" whose body
asks for five years, the same posting in German, an "entry level position" that
demands five years three paragraphs later, a posting welcoming graduates over a
three-year floor, "Quereinsteiger willkommen" over `mindestens 3 Jahre`, and the
reverse: a *senior*-titled posting whose body is plainly entry level. Both directions
are covered because both are real failures — one wastes an application, the other
costs an opportunity.

**Genuinely junior.** A 0-1 range with an outright statement, its German equivalent,
phrase-only entry-level postings in both languages, a graduate programme, a
Werkstudent-flavoured `1-2 Jahre` posting where internships count, an "up to 2 years"
posting, and a junior-titled posting whose body says nothing at all.

**Experienced.** Lead responsibilities with no figure stated, its German counterpart
(`mehrjährige Berufserfahrung`, `fachliche Führung` — the shape most German senior
postings take), a senior role described in full, and a `Teamleitung` posting with
`Personalverantwortung` and `Rufbereitschaft`.

**Ambiguous.** A neutral title over a silent body in both languages, a `1 to 4 years`
range that is evidence for neither side, a junior figure with a senior job attached
to it, and an employer that refuses to count years at all. **Ambiguous is an answer,
not a gap** — a confident wrong verdict is the thing this product must not produce,
so these cases are as load-bearing as the adversarial ones.

---

## 4. Anonymization

Every description is a **paraphrase written for this repository**. No text is copied
from a job board, no employer is identifiable, and every company name is invented.
That is what makes the corpus safe to keep in version control under
`ARCHITECTURE.md` §7.5, and it is a constraint on every future addition:

> Never paste a real posting into the corpus. Read it, decide what it does, and
> write a posting that does the same thing.

The register is deliberately realistic — benefits paragraphs, tech stacks, a sentence
about the team — because the failure the product exists to prevent happens in a
posting where the decisive sentence is buried, not in a two-line fixture.

---

## 5. The other corpora

Four fixture corpora exist and they are not interchangeable:

| Corpus | Scope |
| ------ | ----- |
| `experience-corpus.ts` (M8.1) | 25 numeric phrasings — does the extractor read the figure? |
| `signal-corpus.ts` (M8.2) | Phrase matching, negation, excerpt offsets. |
| `classification-corpus.ts` (M8.3) | 24 short texts, each pinning one branch of `decideLevel`. |
| `regression-corpus.ts` (M8.6) | **This one.** Full postings, end-to-end answers. |

The first three are unit corpora: they fail with a message about a rule. This one
fails with a message about a posting. Both kinds are wanted — when a change breaks a
unit corpus you learn *what* changed, and when it breaks this one you learn *who it
happens to*.

The ten seeded fixtures in `prisma/seed-data.ts` are a fifth set, hand-written at
M2.7 before any of this code existed. `rule-based.classifier.spec.ts` asserts the
classifier reproduces their levels and `score-bands.spec.ts` asserts their
hand-written scores fall in the bands the scorer would give them — which is the
strongest available evidence that the scale matches human judgement rather than
having been fitted to the code.

---

## 6. Changing the corpus

**Adding a case.** Add it when a posting shape is not represented, and especially
after a real posting is classified wrongly during M12.3's tuning: write the
paraphrase, state the level a person would give it, name the signals that justify it,
and say in `why` why that answer is right. `why` is shown in the test name, so a
failure reads as a sentence about the product.

**A case starts failing.** That is the net doing its job. Two possibilities, and they
must be told apart before anything is edited:

1. *The rules got worse* — fix the rules.
2. *The expectation was wrong* — fix the expectation, and say in the commit message
   why the previous answer was wrong. A corpus that is edited to match the code is a
   corpus that guarantees nothing.

**Never** relax an assertion to make a case pass. If a level is genuinely arguable,
the case belongs in the ambiguous group with `AMBIGUOUS` as its answer.

---

## 7. Running it

```bash
cd backend
npm test                                        # the whole suite, corpus included
npx jest classification-regression              # the corpus alone
```

It is a plain unit suite — no database, no network, no fixtures on disk — so CI runs
it by running `npm test` (M12.5). Nothing needs to be wired up for that to happen,
and nothing may make this suite conditional.
