import { Test } from '@nestjs/testing';
import type {
  JobSourceAdapter,
  RawJob,
  SourceDescriptor,
} from './source-adapter.types';
import { SOURCE_ADAPTERS } from './source-adapters.token';
import { SourceRegistryService } from './source-registry.service';
import { SourceDescriptorError } from './source-errors';

function descriptor(
  overrides: Partial<SourceDescriptor> = {},
): SourceDescriptor {
  return {
    key: 'example-source',
    displayName: 'Example Source',
    accessMethod: 'PUBLIC_API',
    termsUrl: 'https://example.com/terms',
    complianceNote: 'Documented public API, used within its stated terms.',
    ordering: 'RECENT_FIRST',
    defaults: { rateLimitRps: 1, pageSize: 25, maxPages: 10 },
    ...overrides,
  };
}

class StubAdapter implements JobSourceAdapter {
  constructor(readonly descriptor: SourceDescriptor) {}

  // Declaring fewer parameters still satisfies JobSourceAdapter; these tests never
  // iterate, and the contract suite covers streaming.
  async *fetchJobs(): AsyncIterable<RawJob> {
    // intentionally empty
  }
}

class SecondStubAdapter extends StubAdapter {}

describe('SourceRegistryService', () => {
  describe('resolution through the SOURCE_ADAPTERS token', () => {
    // M5.1's Verify line: adapters are reached through the injection token, so
    // adding a source is one provider entry and nothing else.
    it('resolves adapters injected through the multi-provider token', async () => {
      const board = new StubAdapter(descriptor({ key: 'fixture-board' }));
      const feed = new StubAdapter(descriptor({ key: 'fixture-feed' }));

      const moduleRef = await Test.createTestingModule({
        providers: [
          { provide: SOURCE_ADAPTERS, useValue: [board, feed] },
          SourceRegistryService,
        ],
      }).compile();

      const registry = moduleRef.get(SourceRegistryService);

      expect(registry.keys()).toEqual(['fixture-board', 'fixture-feed']);
      expect(registry.find('fixture-board')).toBe(board);
      expect(registry.require('fixture-feed')).toBe(feed);
      expect(registry.all()).toHaveLength(2);
    });

    it('boots cleanly with no adapters registered', () => {
      const registry = new SourceRegistryService([]);

      expect(registry.all()).toEqual([]);
      expect(registry.keys()).toEqual([]);
    });
  });

  describe('descriptor validation at construction', () => {
    // A2: an invalid descriptor aborts boot rather than failing on the first run,
    // by which time nobody is watching.
    it('throws when a descriptor is invalid', () => {
      expect(
        () =>
          new SourceRegistryService([
            new StubAdapter(descriptor({ termsUrl: '' })),
          ]),
      ).toThrow(SourceDescriptorError);
    });

    it('aborts module initialisation rather than failing later', async () => {
      const builder = Test.createTestingModule({
        providers: [
          {
            provide: SOURCE_ADAPTERS,
            useValue: [new StubAdapter(descriptor({ complianceNote: '' }))],
          },
          SourceRegistryService,
        ],
      });

      await expect(builder.compile()).rejects.toThrow(/complianceNote/);
    });

    it('throws when an adapter exposes no descriptor at all', () => {
      expect(
        () => new SourceRegistryService([{} as unknown as JobSourceAdapter]),
      ).toThrow(SourceDescriptorError);
    });
  });

  describe('duplicate keys', () => {
    // Two adapters on one key would make JobSource.key ambiguous and silently give
    // one of them the other's postings.
    it('rejects two adapters claiming the same key', () => {
      expect(
        () =>
          new SourceRegistryService([
            new StubAdapter(descriptor({ key: 'same-key' })),
            new SecondStubAdapter(descriptor({ key: 'same-key' })),
          ]),
      ).toThrow(SourceDescriptorError);
    });

    it('names both offending adapters in the message', () => {
      expect(
        () =>
          new SourceRegistryService([
            new StubAdapter(descriptor({ key: 'same-key' })),
            new SecondStubAdapter(descriptor({ key: 'same-key' })),
          ]),
      ).toThrow(
        /StubAdapter.*SecondStubAdapter|SecondStubAdapter.*StubAdapter/s,
      );
    });
  });

  describe('lookup', () => {
    let registry: SourceRegistryService;
    let adapter: StubAdapter;

    beforeEach(() => {
      adapter = new StubAdapter(descriptor({ key: 'known-source' }));
      registry = new SourceRegistryService([adapter]);
    });

    it('reports whether a key is registered', () => {
      expect(registry.has('known-source')).toBe(true);
      expect(registry.has('unknown-source')).toBe(false);
    });

    it('returns undefined from find() for an unknown key', () => {
      expect(registry.find('unknown-source')).toBeUndefined();
    });

    it('throws from require() for an unknown key, listing what is registered', () => {
      expect(() => registry.require('unknown-source')).toThrow(
        /unknown-source.*known-source/s,
      );
    });

    it('exposes the descriptor by key', () => {
      expect(registry.descriptor('known-source')).toBe(adapter.descriptor);
    });
  });
});
