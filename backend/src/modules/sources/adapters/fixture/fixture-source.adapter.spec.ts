import { Logger } from '@nestjs/common';
import {
  FixtureSourceAdapter,
  FIXTURE_SOURCE_KEY,
} from './fixture-source.adapter';
import { describeAdapterContract } from '../../testing/adapter-contract';
import type { FetchContext, RawJob } from '../../source-adapter.types';

function context(): FetchContext & { controller: AbortController } {
  const controller = new AbortController();
  return {
    runId: 'run-1',
    signal: controller.signal,
    logger: new Logger('fixture-test'),
    controller,
  };
}

async function collect(limit = 100, since?: Date): Promise<RawJob[]> {
  const items: RawJob[] = [];
  for await (const job of new FixtureSourceAdapter().fetchJobs(
    { limit, since },
    context(),
  )) {
    items.push(job);
  }
  return items;
}

// Every adapter must pass the shared conformance suite (M5.1).
describeAdapterContract('FixtureSourceAdapter', {
  create: () => new FixtureSourceAdapter(),
  expectedMinimumItems: 8,
});

describe('FixtureSourceAdapter', () => {
  describe('descriptor', () => {
    it('uses the key the seed already provisions', () => {
      expect(new FixtureSourceAdapter().descriptor.key).toBe(
        FIXTURE_SOURCE_KEY,
      );
      expect(FIXTURE_SOURCE_KEY).toBe('fixture-board');
    });

    // Nothing here may be mistaken for a reviewed source (§7.5).
    it('says plainly in its display name that it is development-only', () => {
      expect(new FixtureSourceAdapter().descriptor.displayName).toMatch(
        /development only/i,
      );
    });

    it('carries attribution marking the data synthetic', () => {
      expect(new FixtureSourceAdapter().descriptor.attributionText).toMatch(
        /synthetic/i,
      );
    });

    it('declares the volatile paths that would otherwise churn the content hash', () => {
      expect(
        new FixtureSourceAdapter().descriptor.volatilePayloadPaths,
      ).toEqual(expect.arrayContaining(['fetchedAt']));
    });
  });

  describe('reading the fixture file', () => {
    it('yields every entry in the file', async () => {
      await expect(collect()).resolves.toHaveLength(8);
    });

    it('maps id and url onto RawJob', async () => {
      const [first] = await collect(1);

      expect(first.externalId).toBe('fx-001');
      expect(first.url).toBe('https://fixtures.juniorjob.local/jobs/fx-001');
    });

    it('stores the entry verbatim as the payload', async () => {
      const [first] = await collect(1);

      // Normalization (M6) owns interpreting this; the adapter must not reshape it.
      expect(first.payload).toMatchObject({
        id: 'fx-001',
        title: 'Junior Backend Developer (m/f/d)',
        company: 'Nordwind Software GmbH',
      });
    });

    it('parses postedAt when the entry states one', async () => {
      const [first] = await collect(1);

      expect(first.postedAt).toEqual(new Date('2026-08-20T09:00:00.000Z'));
    });

    it('leaves postedAt undefined when the entry has none', async () => {
      const items = await collect();
      const undated = items.find((job) => job.externalId === 'fx-007');

      expect(undated).toBeDefined();
      expect(undated?.postedAt).toBeUndefined();
    });
  });

  describe('pagination', () => {
    // The adapter slices the file so the shared base's paging, page cap and
    // cursor-progress logic are exercised by a real adapter, not only by their own
    // unit tests.
    it('pages through the file rather than returning it in one block', async () => {
      const adapter = new FixtureSourceAdapter();
      const pageSize = adapter.descriptor.defaults.pageSize;
      expect(pageSize).toBeLessThan(8);

      await expect(collect()).resolves.toHaveLength(8);
    });

    it('honours a limit that falls inside the first page', async () => {
      await expect(collect(2)).resolves.toHaveLength(2);
    });

    it('honours a limit that spans several pages', async () => {
      await expect(collect(5)).resolves.toHaveLength(5);
    });
  });

  describe('`since`', () => {
    it('stops at the boundary, because the file is newest-first', async () => {
      const items = await collect(100, new Date('2026-08-18T00:00:00.000Z'));

      expect(items.map((job) => job.externalId)).toEqual([
        'fx-001',
        'fx-002',
        'fx-003',
      ]);
    });
  });

  describe('the corpus it provides', () => {
    // Phases 6-8 are checked against this, so the adversarial case must be present.
    it('includes a "Junior" title whose body demands 5+ years', async () => {
      const items = await collect();
      const adversarial = items.find((job) => job.externalId === 'fx-003');
      const payload = adversarial?.payload as {
        title: string;
        description: string;
      };

      expect(payload.title).toMatch(/junior/i);
      expect(payload.description).toMatch(/at least 5 years/i);
    });

    it('includes German-language postings', async () => {
      const items = await collect();
      const german = items.find((job) => job.externalId === 'fx-004');
      const payload = german?.payload as { description: string };

      expect(payload.description).toMatch(/Berufserfahrung/);
    });

    it('never points at a real job board', async () => {
      const items = await collect();

      for (const job of items) {
        expect(job.url).toMatch(/^https:\/\/fixtures\.juniorjob\.local\//);
      }
    });
  });
});
