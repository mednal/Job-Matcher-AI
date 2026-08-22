import type { SourceDescriptor } from './source-adapter.types';
import { validateSourceDescriptor } from './source-descriptor.validator';
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

function expectRejected(overrides: Partial<SourceDescriptor>): void {
  expect(() => validateSourceDescriptor(descriptor(overrides))).toThrow(
    SourceDescriptorError,
  );
}

describe('validateSourceDescriptor', () => {
  it('accepts a complete descriptor', () => {
    expect(() => validateSourceDescriptor(descriptor())).not.toThrow();
  });

  // Decision A2: these three are what §7.3 requires an adapter to state, so the
  // application refuses to boot without them rather than trusting reviewer memory.
  describe('the three fields registration refuses to boot without', () => {
    it('rejects a missing accessMethod', () => {
      expectRejected({ accessMethod: undefined });
    });

    it('rejects a missing termsUrl', () => {
      expectRejected({ termsUrl: '' });
    });

    it('rejects a missing complianceNote', () => {
      expectRejected({ complianceNote: '   ' });
    });
  });

  // §7.1 has no enum value for scraping and none may be added, so anything outside
  // the enum is a policy failure rather than a typo to tolerate.
  it('rejects an access method outside the permitted set', () => {
    expectRejected({ accessMethod: 'SCRAPING' as never });
    expectRejected({ accessMethod: 'WEB_SCRAPE' as never });
  });

  it('rejects a termsUrl that is not an absolute https URL', () => {
    expectRejected({ termsUrl: 'http://example.com/terms' });
    expectRejected({ termsUrl: '/terms' });
    expectRejected({ termsUrl: 'not a url' });
  });

  it('rejects a key that is not lowercase kebab-case', () => {
    expectRejected({ key: 'Example Source' });
    expectRejected({ key: 'example_source' });
    expectRejected({ key: 'ExampleSource' });
    expectRejected({ key: '' });
  });

  it('accepts a valid kebab-case key', () => {
    expect(() =>
      validateSourceDescriptor(descriptor({ key: 'a-b-c-1' })),
    ).not.toThrow();
  });

  it('rejects an unknown ordering', () => {
    expectRejected({ ordering: 'ALPHABETICAL' as never });
  });

  it('rejects an empty attributionText instead of silently keeping it', () => {
    expectRejected({ attributionText: '  ' });
  });

  it('accepts an omitted attributionText', () => {
    expect(() =>
      validateSourceDescriptor(descriptor({ attributionText: undefined })),
    ).not.toThrow();
  });

  // A zero or negative rate limit would disable the client-side ceiling §7.3.3
  // requires, and a missing page cap turns a cursor bug into an unbounded loop
  // against a third party.
  describe('defaults that guardrails depend on', () => {
    it('rejects a non-positive rateLimitRps', () => {
      expectRejected({
        defaults: { rateLimitRps: 0, pageSize: 1, maxPages: 1 },
      });
      expectRejected({
        defaults: { rateLimitRps: -1, pageSize: 1, maxPages: 1 },
      });
    });

    it('rejects a non-finite rateLimitRps', () => {
      expectRejected({
        defaults: {
          rateLimitRps: Number.POSITIVE_INFINITY,
          pageSize: 1,
          maxPages: 1,
        },
      });
      expectRejected({
        defaults: { rateLimitRps: NaN, pageSize: 1, maxPages: 1 },
      });
    });

    it('rejects a non-positive or fractional pageSize', () => {
      expectRejected({
        defaults: { rateLimitRps: 1, pageSize: 0, maxPages: 1 },
      });
      expectRejected({
        defaults: { rateLimitRps: 1, pageSize: 1.5, maxPages: 1 },
      });
    });

    it('rejects a missing or non-positive maxPages', () => {
      expectRejected({
        defaults: { rateLimitRps: 1, pageSize: 1, maxPages: 0 },
      });
      expectRejected({
        defaults: {
          rateLimitRps: 1,
          pageSize: 1,
          maxPages: undefined as never,
        },
      });
    });

    it('rejects a missing defaults block', () => {
      expectRejected({ defaults: undefined });
    });
  });

  it('rejects malformed volatilePayloadPaths', () => {
    expectRejected({ volatilePayloadPaths: 'meta.requestId' as never });
    expectRejected({ volatilePayloadPaths: [''] });
    expectRejected({ volatilePayloadPaths: [42 as never] });
  });

  it('names the offending source in the error message', () => {
    expect(() =>
      validateSourceDescriptor(descriptor({ termsUrl: '' })),
    ).toThrow(/example-source/);
  });
});
