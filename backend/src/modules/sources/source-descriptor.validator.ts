import { AccessMethod } from '@prisma/client';
import type { SourceDescriptor } from './source-adapter.types';
import { SourceDescriptorError } from './source-errors';

// Decision A2: registration validates every descriptor and the application
// **refuses to boot** on a missing accessMethod, termsUrl or complianceNote. The
// point is that §7.3's compliance requirement is enforced by the application rather
// than by whether a reviewer remembered to look.

const KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VALID_ACCESS_METHODS = new Set<string>(Object.values(AccessMethod));

function fail(key: string, problem: string): never {
  throw new SourceDescriptorError(
    `Invalid SourceDescriptor for "${key}": ${problem}`,
  );
}

function requireNonEmpty(
  key: string,
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(key, `${field} is required and must be a non-empty string`);
  }
}

export function validateSourceDescriptor(descriptor: SourceDescriptor): void {
  const key = descriptor?.key ?? '<missing key>';

  requireNonEmpty(key, descriptor?.key, 'key');
  if (!KEY_PATTERN.test(descriptor.key)) {
    fail(
      key,
      'key must be lowercase kebab-case — it is written to JobSource.key and appears in logs',
    );
  }

  requireNonEmpty(key, descriptor.displayName, 'displayName');

  // §7.1. The enum has no value for scraping and none may be added, so an
  // unrecognised access method is a policy failure, not a typo to tolerate.
  if (!VALID_ACCESS_METHODS.has(descriptor.accessMethod)) {
    fail(
      key,
      `accessMethod must be one of ${[...VALID_ACCESS_METHODS].join(', ')} (docs/ARCHITECTURE.md §7.1)`,
    );
  }

  requireNonEmpty(key, descriptor.termsUrl, 'termsUrl');
  // https only, and absolute. A relative or http reference cannot identify the
  // terms that permit this access, which is the field's entire purpose.
  let terms: URL;
  try {
    terms = new URL(descriptor.termsUrl);
  } catch {
    return fail(key, 'termsUrl must be an absolute URL');
  }
  if (terms.protocol !== 'https:') {
    fail(key, 'termsUrl must use https');
  }

  requireNonEmpty(key, descriptor.complianceNote, 'complianceNote');

  if (
    descriptor.attributionText !== undefined &&
    (typeof descriptor.attributionText !== 'string' ||
      descriptor.attributionText.trim().length === 0)
  ) {
    fail(
      key,
      'attributionText, when present, must be a non-empty string — omit it instead',
    );
  }

  if (
    descriptor.ordering !== 'RECENT_FIRST' &&
    descriptor.ordering !== 'UNSPECIFIED'
  ) {
    fail(key, "ordering must be 'RECENT_FIRST' or 'UNSPECIFIED'");
  }

  if (descriptor.volatilePayloadPaths !== undefined) {
    if (!Array.isArray(descriptor.volatilePayloadPaths)) {
      fail(key, 'volatilePayloadPaths must be an array of dot-separated paths');
    }
    for (const path of descriptor.volatilePayloadPaths) {
      if (typeof path !== 'string' || path.trim().length === 0) {
        fail(key, 'volatilePayloadPaths entries must be non-empty strings');
      }
    }
  }

  const defaults = descriptor.defaults;
  if (defaults === null || typeof defaults !== 'object') {
    fail(key, 'defaults is required');
  }

  // A non-positive or non-finite rate limit would disable the client-side ceiling
  // §7.3.3 requires, so it is rejected rather than defaulted.
  if (!Number.isFinite(defaults.rateLimitRps) || defaults.rateLimitRps <= 0) {
    fail(key, 'defaults.rateLimitRps must be a positive number');
  }
  if (!Number.isInteger(defaults.pageSize) || defaults.pageSize <= 0) {
    fail(key, 'defaults.pageSize must be a positive integer');
  }
  // The page cap is the backstop against a source that paginates forever; without
  // it a cursor bug becomes an unbounded request loop against someone else's API.
  if (!Number.isInteger(defaults.maxPages) || defaults.maxPages <= 0) {
    fail(key, 'defaults.maxPages must be a positive integer');
  }
}
