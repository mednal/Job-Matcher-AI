import type { JobSourceAdapter } from './source-adapter.types';

/**
 * Multi-provider token holding every registered adapter (docs/ARCHITECTURE.md §6.1).
 * Adding a source is one new directory under `adapters/` plus one entry in
 * `SourcesModule`'s provider array — nothing else in the application changes.
 */
export const SOURCE_ADAPTERS = Symbol('SOURCE_ADAPTERS');

export type SourceAdapterList = readonly JobSourceAdapter[];
