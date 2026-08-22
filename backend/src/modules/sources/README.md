# Job source adapters

Governed by `docs/ARCHITECTURE.md` §6.1 (interface) and §7 (compliance policy).
**§7 is binding and takes precedence over any convenience this interface offers.**

Before writing an adapter, the source must have cleared the review in
`docs/SOURCES.md`. An adapter for an unreviewed source is not merged, however
straightforward the integration looks. The fixture adapter is the sole exception,
and it fetches nothing.

---

## 1. The header comment is mandatory

Per §7.3.1, every adapter file opens with a comment naming three things:

```ts
/**
 * SOURCE:        <name of the source>
 * ACCESS METHOD: <the exact mechanism — which API, which feed, which endpoint>
 * PERMITTED BY:  <the terms, licence, or agreement that allows it, with a link>
 */
```

**An adapter that cannot state all three is not merged.** This is not paperwork: if
nobody can write down what permits the access, then nothing has established that it
is permitted, and the honest conclusion is that it is not.

The `SourceDescriptor` is the machine-readable twin of that comment (decision A2).
`SourceRegistryService` validates it in its constructor, so a missing
`accessMethod`, `termsUrl` or `complianceNote` **aborts application boot** rather
than failing on the first run. Keep the comment and the descriptor consistent; the
descriptor is what the application enforces, the comment is what a reviewer reads.

## 2. Never reach the network directly

Adapters receive `SourceHttpClient` by injection. It is the only permitted path out,
because it is where every §7 guardrail lives:

| Guardrail | §  |
| --------- | -- |
| Truthful User-Agent with a contact address | 7.3.2 |
| Conservative client-side rate limiting | 7.3.3 |
| Retries on 5xx and network errors only, with exponential backoff and jitter | 7.3.3 |
| `401` / `403` / `429` / block pages end the run | 7.3.4 |
| https-only, per-request timeout, typed error classification | 7.1 |

Importing `axios`, `node-fetch`, `got`, `undici`, `http`, `https`, or calling global
`fetch` from an adapter is a policy bypass, not a shortcut. `sources.imports.spec.ts`
fails the build for it.

Node 24's global `fetch` plus `AbortSignal.timeout` is the whole HTTP stack
(decision A7). Do not add an HTTP dependency.

## 3. Extend `PaginatedSourceAdapter`, implement one page

`fetchJobs` returns an `AsyncIterable<RawJob>`, not a `Promise<RawJob[]>`
(decision A1). You implement `fetchPage`; the base drives the loop and owns:

- the **page cap** (`descriptor.defaults.maxPages`);
- the **cursor-progress check** — a repeated cursor ends the run, so an adapter bug
  cannot become an unbounded request loop against someone else's API;
- the **`since` early stop** (only sound when `ordering: 'RECENT_FIRST'`);
- the **`limit`** and the **abort signal**.

`fetchPage` must not loop, must not sleep, and must not retry. Every one of those
belongs to shared, reviewed code — pagination is exactly where rate-limit and
stop-condition mistakes happen, and per-source code gets the least review.

Declare `ordering` truthfully. Claiming `RECENT_FIRST` for a source that does not
order by date silently truncates every run that passes `since`.

## 4. Stop conditions are stops

`401`, `403`, `429` and challenge/block pages end the run for that source (§7.3.4).
They are **never** an obstacle to route around. §7.2 prohibits rotating IPs,
spoofing a browser User-Agent, solving CAPTCHAs, and exceeding rate limits, whether
or not any of it is technically possible.

`SourceHttpClient` detects a block page **in order to stop**. If you find yourself
wanting to make that detection smarter so a request can get through, the answer is
to stop and re-read the terms.

## 5. Errors: degrade or stop, never guess

Throw from the `SourceError` hierarchy in `source-errors.ts`:

- `SourceItemError` — one posting is unusable. Skipped, counted in
  `IngestionRun.failed`, the run continues.
- Anything extending `SourceRunError` — the run for this source ends.

Callers branch on `terminatesRun`, never on a string match against a message.

## 6. Store the payload verbatim

`RawJob.payload` is `unknown` and is written to `RawJobDocument` untouched. Do not
reshape, trim, or pre-normalize it — that is M6's job, and `DATABASE.md` §6 needs the
original to recompute from when a canonicalization rule changes.

Declare `volatilePayloadPaths` for anything the source rewrites on every response
(request ids, response timestamps, signed URLs). Those are excluded from
`contentHash` only; the stored payload still contains them. Without this, every run
writes a new row for every unchanged posting.

## 7. Every adapter passes the contract suite

In your adapter's spec:

```ts
import { describeAdapterContract } from '../../testing/adapter-contract';

describeAdapterContract('MySourceAdapter', {
  create: () => new MySourceAdapter(httpClient),
});
```

Your own cases prove you parse your source correctly. The contract suite proves you
honour the shared interface — the part the orchestrator relies on and the part a new
adapter is most likely to get subtly wrong.

## 8. Adding a source

1. Clear the §7.5 review and record the finding in `docs/SOURCES.md`.
2. Create `adapters/<key>/` with the header comment and a valid descriptor.
3. Add the class to the `ADAPTERS` array in `sources.module.ts`. That is the only
   file outside your directory that changes.
4. Add a spec that calls `describeAdapterContract` plus your own parsing cases.
5. Seed or confirm the `JobSource` row. Compliance fields sync from the descriptor
   on every run (decision A3); the database owns only `enabled`, so a source can be
   stopped without a deploy.

Nothing outside this directory may import a concrete adapter or name a
source-specific field. The dependency arrow points one way (§4.2).
