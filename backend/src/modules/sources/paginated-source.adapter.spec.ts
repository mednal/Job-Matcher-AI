import { Logger } from '@nestjs/common';
import { PaginatedSourceAdapter } from './paginated-source.adapter';
import type {
  FetchContext,
  RawJob,
  SourceDescriptor,
  SourcePage,
  SourcePageRequest,
} from './source-adapter.types';

function descriptor(
  overrides: Partial<SourceDescriptor> = {},
): SourceDescriptor {
  return {
    key: 'example-source',
    displayName: 'Example Source',
    accessMethod: 'PUBLIC_API',
    termsUrl: 'https://example.com/terms',
    complianceNote: 'Documented public API.',
    ordering: 'RECENT_FIRST',
    defaults: { rateLimitRps: 10, pageSize: 2, maxPages: 3 },
    ...overrides,
  };
}

function job(id: string, postedAt?: string): RawJob {
  return {
    externalId: id,
    url: `https://example.com/jobs/${id}`,
    payload: { id },
    postedAt: postedAt ? new Date(postedAt) : undefined,
  };
}

/** Drives the base from a scripted list of pages. */
class ScriptedAdapter extends PaginatedSourceAdapter {
  readonly requests: SourcePageRequest[] = [];

  constructor(
    readonly descriptor: SourceDescriptor,
    private readonly pages: SourcePage[],
  ) {
    super();
  }

  protected fetchPage(request: SourcePageRequest): Promise<SourcePage> {
    this.requests.push(request);
    const page = this.pages[request.pageNumber - 1] ?? { jobs: [] };
    return Promise.resolve(page);
  }
}

function context(): FetchContext & { controller: AbortController } {
  const controller = new AbortController();
  return {
    runId: 'run-1',
    signal: controller.signal,
    logger: new Logger('test'),
    controller,
  };
}

async function drain(
  adapter: PaginatedSourceAdapter,
  limit: number,
  ctx: FetchContext,
  since?: Date,
): Promise<string[]> {
  const ids: string[] = [];
  for await (const item of adapter.fetchJobs({ limit, since }, ctx)) {
    ids.push(item.externalId);
  }
  return ids;
}

describe('PaginatedSourceAdapter', () => {
  it('walks pages until a page returns no next cursor', async () => {
    const adapter = new ScriptedAdapter(descriptor(), [
      { jobs: [job('a'), job('b')], nextCursor: 'c2' },
      { jobs: [job('c')] },
    ]);

    await expect(drain(adapter, 100, context())).resolves.toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(adapter.requests).toHaveLength(2);
  });

  it('stops on an empty page even when a cursor was offered', async () => {
    const adapter = new ScriptedAdapter(descriptor(), [
      { jobs: [job('a')], nextCursor: 'c2' },
      { jobs: [], nextCursor: 'c3' },
    ]);

    await expect(drain(adapter, 100, context())).resolves.toEqual(['a']);
    expect(adapter.requests).toHaveLength(2);
  });

  it('passes the descriptor page size and a 1-based page number through', async () => {
    const adapter = new ScriptedAdapter(descriptor(), [
      { jobs: [job('a')], nextCursor: 'c2' },
      { jobs: [job('b')] },
    ]);

    await drain(adapter, 100, context());

    expect(adapter.requests[0]).toMatchObject({ pageNumber: 1, pageSize: 2 });
    expect(adapter.requests[1]).toMatchObject({ pageNumber: 2, cursor: 'c2' });
  });

  describe('limit', () => {
    it('stops mid-page once the limit is reached', async () => {
      const adapter = new ScriptedAdapter(descriptor(), [
        { jobs: [job('a'), job('b')], nextCursor: 'c2' },
        { jobs: [job('c')] },
      ]);

      await expect(drain(adapter, 1, context())).resolves.toEqual(['a']);
      // Stopped before requesting page 2 at all.
      expect(adapter.requests).toHaveLength(1);
    });

    it('yields nothing and requests nothing for a limit of zero', async () => {
      const adapter = new ScriptedAdapter(descriptor(), [{ jobs: [job('a')] }]);

      await expect(drain(adapter, 0, context())).resolves.toEqual([]);
      expect(adapter.requests).toHaveLength(0);
    });
  });

  describe('page cap', () => {
    // The backstop against a source that paginates forever: without it a cursor bug
    // becomes an unbounded request loop against a third party (§7.2).
    it('stops at maxPages even when the source keeps offering cursors', async () => {
      const pages: SourcePage[] = Array.from({ length: 10 }, (_, i) => ({
        jobs: [job(`p${i + 1}`)],
        nextCursor: `c${i + 2}`,
      }));
      const adapter = new ScriptedAdapter(
        descriptor({
          defaults: { rateLimitRps: 10, pageSize: 1, maxPages: 3 },
        }),
        pages,
      );

      await expect(drain(adapter, 1000, context())).resolves.toEqual([
        'p1',
        'p2',
        'p3',
      ]);
      expect(adapter.requests).toHaveLength(3);
    });
  });

  describe('cursor-progress check', () => {
    it('ends the run when the cursor does not advance', async () => {
      const adapter = new ScriptedAdapter(
        descriptor({
          defaults: { rateLimitRps: 10, pageSize: 1, maxPages: 50 },
        }),
        [
          { jobs: [job('a')], nextCursor: 'stuck' },
          { jobs: [job('b')], nextCursor: 'stuck' },
          { jobs: [job('c')], nextCursor: 'stuck' },
        ],
      );

      await expect(drain(adapter, 1000, context())).resolves.toEqual([
        'a',
        'b',
      ]);
      // Two requests, not fifty — the repeat is caught immediately.
      expect(adapter.requests).toHaveLength(2);
    });

    it('ends the run when a cursor reappears after advancing', async () => {
      const adapter = new ScriptedAdapter(
        descriptor({
          defaults: { rateLimitRps: 10, pageSize: 1, maxPages: 50 },
        }),
        [
          { jobs: [job('a')], nextCursor: 'c2' },
          { jobs: [job('b')], nextCursor: 'c3' },
          { jobs: [job('c')], nextCursor: 'c2' },
        ],
      );

      await expect(drain(adapter, 1000, context())).resolves.toEqual([
        'a',
        'b',
        'c',
      ]);
      expect(adapter.requests).toHaveLength(3);
    });
  });

  describe('`since` handling', () => {
    const since = new Date('2026-08-18T00:00:00.000Z');

    // Sound only because the source declared RECENT_FIRST: everything after the
    // boundary is older still.
    it('stops at the boundary for a RECENT_FIRST source', async () => {
      const adapter = new ScriptedAdapter(
        descriptor({ ordering: 'RECENT_FIRST' }),
        [
          {
            jobs: [
              job('new', '2026-08-20T00:00:00.000Z'),
              job('old', '2026-08-10T00:00:00.000Z'),
            ],
            nextCursor: 'c2',
          },
          { jobs: [job('newer', '2026-08-21T00:00:00.000Z')] },
        ],
      );

      await expect(drain(adapter, 100, context(), since)).resolves.toEqual([
        'new',
      ]);
      expect(adapter.requests).toHaveLength(1);
    });

    // For UNSPECIFIED ordering a later page may still hold newer postings, so the
    // old item is filtered but the walk continues.
    it('filters without stopping for an UNSPECIFIED source', async () => {
      const adapter = new ScriptedAdapter(
        descriptor({ ordering: 'UNSPECIFIED' }),
        [
          {
            jobs: [
              job('new', '2026-08-20T00:00:00.000Z'),
              job('old', '2026-08-10T00:00:00.000Z'),
            ],
            nextCursor: 'c2',
          },
          { jobs: [job('newer', '2026-08-21T00:00:00.000Z')] },
        ],
      );

      await expect(drain(adapter, 100, context(), since)).resolves.toEqual([
        'new',
        'newer',
      ]);
      expect(adapter.requests).toHaveLength(2);
    });

    it('keeps an item whose postedAt is unknown', async () => {
      const adapter = new ScriptedAdapter(descriptor(), [
        { jobs: [job('undated')] },
      ]);

      await expect(drain(adapter, 100, context(), since)).resolves.toEqual([
        'undated',
      ]);
    });

    it('keeps an item exactly at the boundary', async () => {
      const adapter = new ScriptedAdapter(descriptor(), [
        { jobs: [job('boundary', since.toISOString())] },
      ]);

      await expect(drain(adapter, 100, context(), since)).resolves.toEqual([
        'boundary',
      ]);
    });
  });

  describe('abort', () => {
    it('stops before requesting a further page', async () => {
      const ctx = context();
      const adapter = new ScriptedAdapter(descriptor(), [
        { jobs: [job('a')], nextCursor: 'c2' },
        { jobs: [job('b')] },
      ]);

      const ids: string[] = [];
      for await (const item of adapter.fetchJobs({ limit: 100 }, ctx)) {
        ids.push(item.externalId);
        ctx.controller.abort();
      }

      expect(ids).toEqual(['a']);
      expect(adapter.requests).toHaveLength(1);
    });

    it('yields nothing when already aborted', async () => {
      const ctx = context();
      ctx.controller.abort();
      const adapter = new ScriptedAdapter(descriptor(), [{ jobs: [job('a')] }]);

      await expect(drain(adapter, 100, ctx)).resolves.toEqual([]);
      expect(adapter.requests).toHaveLength(0);
    });
  });

  it('skips an empty entry rather than crashing the stream', async () => {
    const adapter = new ScriptedAdapter(descriptor(), [
      { jobs: [job('a'), null as unknown as RawJob, job('b')] },
    ]);

    await expect(drain(adapter, 100, context())).resolves.toEqual(['a', 'b']);
  });
});
