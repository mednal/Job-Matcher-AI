import { createHash } from 'crypto';

/**
 * Canonicalization and content hashing for `RawJobDocument` (M5.3).
 *
 * The stored payload is **always verbatim**. Canonicalization exists only to
 * produce a hash that is stable across cosmetic differences, so that re-fetching an
 * unchanged posting writes no new row. Two things break that stability:
 *
 *  - **Key order.** `JSON.stringify` preserves insertion order, so the same posting
 *    serialized by a source that reorders its JSON keys would hash differently.
 *  - **Volatile fields.** Response timestamps, request ids and signed URLs change on
 *    every response without the posting having changed. Each source declares its
 *    own in `SourceDescriptor.volatilePayloadPaths`.
 *
 * Without both, every run would write a new row for every posting and the 90-day
 * retention sweep (M5.6) would be storing noise.
 */

/**
 * Dot-separated path into the payload, e.g. `meta.requestId`.
 *
 * A leading segment is matched at the root; a path is also matched at the top level
 * of each element when the value it walks into is an array, so `items.fetchedAt`
 * strips `fetchedAt` from every element of `items`. There is deliberately no `*`
 * wildcard syntax: paths are declared per source by whoever wrote the adapter, and
 * a pattern language here would be one more thing to get wrong for no gain.
 */
export type VolatilePath = string;

type JsonLike = unknown;

function isPlainObject(value: unknown): value is Record<string, JsonLike> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/**
 * Returns a deep copy with `paths` removed. Never mutates the input — the caller
 * still has to store the payload verbatim.
 */
export function stripVolatilePaths(
  payload: JsonLike,
  paths: readonly VolatilePath[] = [],
): JsonLike {
  if (paths.length === 0) {
    return payload;
  }
  const segmented = paths
    .map((path) => path.split('.').filter((segment) => segment.length > 0))
    .filter((segments) => segments.length > 0);

  return strip(payload, segmented);
}

function strip(value: JsonLike, paths: string[][]): JsonLike {
  if (Array.isArray(value)) {
    // Apply the same paths to every element, so a path can address fields inside a
    // collection without naming an index that would differ between responses.
    return value.map((entry) => strip(entry, paths));
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const removeHere = new Set(
    paths.filter((segments) => segments.length === 1).map(([head]) => head),
  );

  const result: Record<string, JsonLike> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (removeHere.has(key)) {
      continue;
    }
    const deeper = paths
      .filter((segments) => segments.length > 1 && segments[0] === key)
      .map((segments) => segments.slice(1));

    result[key] = deeper.length > 0 ? strip(entry, deeper) : entry;
  }
  return result;
}

/**
 * Deterministic JSON: object keys sorted at every depth, array order preserved
 * (array order is data, not formatting).
 */
export function canonicalizePayload(
  payload: JsonLike,
  volatilePaths: readonly VolatilePath[] = [],
): string {
  return stableStringify(stripVolatilePaths(payload, volatilePaths));
}

function stableStringify(value: JsonLike): string {
  if (value === undefined) {
    // JSON.stringify(undefined) is undefined, not a string; normalize so a missing
    // field and an explicit null cannot produce different hashes by accident.
    return 'null';
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, JsonLike>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`;
}

/**
 * `RawJobDocument.contentHash` — sha256 of the canonicalized payload, hex.
 * Part of the `(sourceId, externalId, contentHash)` unique key, which is what makes
 * an unchanged re-fetch a no-op rather than a new row.
 */
export function contentHashOf(
  payload: JsonLike,
  volatilePaths: readonly VolatilePath[] = [],
): string {
  return createHash('sha256')
    .update(canonicalizePayload(payload, volatilePaths))
    .digest('hex');
}
