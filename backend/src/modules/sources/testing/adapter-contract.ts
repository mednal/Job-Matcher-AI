import { Logger } from '@nestjs/common';
import type {
  FetchContext,
  JobSourceAdapter,
  RawJob,
  SourceFetchParams,
} from '../source-adapter.types';
import { validateSourceDescriptor } from '../source-descriptor.validator';

/**
 * The conformance suite **every** adapter must pass (M5.1).
 *
 * An adapter's own spec proves it parses its own source correctly. This proves it
 * honours the shared contract — the part the orchestrator relies on and the part a
 * new adapter is most likely to get subtly wrong. Adding a source therefore means
 * adding one `describeAdapterContract(...)` line, not remembering which of a dozen
 * invariants to re-test by hand.
 *
 * Not a `.spec.ts` file on purpose: it defines a suite, it is not one. Jest's
 * `testRegex` only collects `*.spec.ts`, so this is picked up solely where an
 * adapter's spec imports it.
 */

export interface AdapterContractOptions {
  /**
   * Fresh instance per case. A factory rather than an instance so one case's
   * internal caching cannot leak into the next.
   */
  readonly create: () => JobSourceAdapter;
  /**
   * How many items the adapter can yield when unconstrained. Cases that assert
   * `limit` and paging need at least a few, so a fixture-backed adapter should
   * report its real count.
   */
  readonly expectedMinimumItems?: number;
}

function contextFor(
  name: string,
): FetchContext & { controller: AbortController } {
  const controller = new AbortController();
  return {
    runId: `contract-${name}`,
    signal: controller.signal,
    logger: new Logger(`contract:${name}`),
    controller,
  };
}

async function collect(
  adapter: JobSourceAdapter,
  params: SourceFetchParams,
  ctx: FetchContext,
): Promise<RawJob[]> {
  const items: RawJob[] = [];
  for await (const job of adapter.fetchJobs(params, ctx)) {
    items.push(job);
  }
  return items;
}

export function describeAdapterContract(
  name: string,
  options: AdapterContractOptions,
): void {
  const { create, expectedMinimumItems = 1 } = options;

  describe(`${name} — JobSourceAdapter contract`, () => {
    it('exposes a descriptor that passes validation', () => {
      expect(() => validateSourceDescriptor(create().descriptor)).not.toThrow();
    });

    it('declares a compliance note and the terms permitting its access method', () => {
      const { descriptor } = create();
      // §7.3.1 in machine-readable form: an adapter that cannot state this is not
      // merged, and A2 makes the application refuse to boot without it.
      expect(descriptor.complianceNote.trim().length).toBeGreaterThan(0);
      expect(descriptor.termsUrl).toMatch(/^https:\/\//);
    });

    it('returns an AsyncIterable rather than a promised array', () => {
      const ctx = contextFor(name);
      const stream = create().fetchJobs({ limit: 1 }, ctx);

      expect(typeof stream[Symbol.asyncIterator]).toBe('function');
    });

    it('yields well-formed RawJobs', async () => {
      const ctx = contextFor(name);
      const items = await collect(create(), { limit: 100 }, ctx);

      expect(items.length).toBeGreaterThanOrEqual(expectedMinimumItems);
      for (const job of items) {
        expect(typeof job.externalId).toBe('string');
        expect(job.externalId.length).toBeGreaterThan(0);
        // §7.4 — the UI always links out to the original posting, so this must be
        // a real absolute URL, and §7.1 permits no plaintext access.
        expect(job.url).toMatch(/^https:\/\//);
        expect(job.payload).toBeDefined();
        if (job.postedAt !== undefined) {
          expect(job.postedAt).toBeInstanceOf(Date);
          expect(Number.isNaN(job.postedAt.getTime())).toBe(false);
        }
      }
    });

    it('yields externalIds that are unique within one call', async () => {
      const ctx = contextFor(name);
      const items = await collect(create(), { limit: 100 }, ctx);
      const ids = items.map((job) => job.externalId);

      // Duplicates here would corrupt tier-1 dedup, which keys on
      // (sourceId, externalId).
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('never yields more than `limit`', async () => {
      const ctx = contextFor(name);
      const items = await collect(create(), { limit: 2 }, ctx);

      expect(items.length).toBeLessThanOrEqual(2);
    });

    it('yields nothing for a limit of zero', async () => {
      const ctx = contextFor(name);

      await expect(collect(create(), { limit: 0 }, ctx)).resolves.toEqual([]);
    });

    it('terminates rather than paginating forever', async () => {
      const ctx = contextFor(name);
      // The page cap and cursor-progress check live in PaginatedSourceAdapter; an
      // adapter that overrides fetchJobs still has to terminate on its own.
      const items = await collect(create(), { limit: 10_000 }, ctx);

      expect(Array.isArray(items)).toBe(true);
    });

    it('stops when the run is aborted', async () => {
      const ctx = contextFor(name);
      const items: RawJob[] = [];

      for await (const job of create().fetchJobs({ limit: 100 }, ctx)) {
        items.push(job);
        // Abort as soon as anything arrives; nothing may be yielded after the
        // iterator next resumes.
        ctx.controller.abort();
      }

      expect(items.length).toBeLessThanOrEqual(1);
    });

    it('produces a stable result for the same input', async () => {
      const first = await collect(create(), { limit: 5 }, contextFor(name));
      const second = await collect(create(), { limit: 5 }, contextFor(name));

      // externalId must be stable within a source permanently — tier-1 dedup and
      // RawJobDocument's unique key both depend on it.
      expect(second.map((j) => j.externalId)).toEqual(
        first.map((j) => j.externalId),
      );
    });
  });
}
