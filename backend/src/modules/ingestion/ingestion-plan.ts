/**
 * M5.4 — the ingestion plan (`ARCHITECTURE.md` §6, resolved as §14.5 on 2026-08-22).
 *
 * A background crawl has no user request to take `query` and `location` from, so
 * every run is driven by a curated list of **seeds** aimed at junior-relevant roles.
 * They live here rather than on `SourceDescriptor` because they are product tuning,
 * not compliance metadata: a bad seed returns irrelevant postings, where a bad
 * `termsUrl` is a legal problem — and only the second kind is allowed to stop the
 * application booting (A2).
 *
 * Seeds overlap heavily by design. "junior software developer" and "entry level
 * developer" return many of the same postings, and that costs almost nothing: the
 * raw stage recognizes an unchanged payload by content hash and writes no row
 * (M5.3), while tier 1 recognizes the posting by `(sourceId, externalId)` and
 * updates in place. Breadth is cheap here and a missed posting is not.
 */

/** One search a run performs against one source. */
export interface IngestionSeed {
  /** Omitted for a source that takes no query — a plain "recent postings" feed. */
  readonly query?: string;
  /** Omitted to mean "wherever the source defaults to". */
  readonly location?: string;
}

/**
 * The shared list, in English and German because §5.4 supports both from day one.
 *
 * Titles, not skills. A stack-specific seed ("junior java developer") narrows to
 * whichever technologies happen to be listed here, and the technology facet is
 * already extracted from the posting text by M6.3 — so seeding by seniority
 * vocabulary and filtering by stack later covers strictly more ground.
 *
 * No `location`: the shared list is deliberately unscoped, because a location that
 * suits one deployment silently hides every posting outside it. A source that must
 * be scoped says so in {@link SOURCE_SEEDS}.
 */
export const DEFAULT_SEEDS: readonly IngestionSeed[] = [
  { query: 'junior software developer' },
  { query: 'graduate software engineer' },
  { query: 'entry level developer' },
  { query: 'trainee software engineer' },
  { query: 'software developer intern' },
  { query: 'junior entwickler' },
  { query: 'werkstudent softwareentwicklung' },
  { query: 'berufseinsteiger softwareentwicklung' },
  { query: 'praktikum softwareentwicklung' },
  { query: 'absolvent informatik' },
];

/**
 * The single empty seed of §6 — one unfiltered walk, for a source whose API takes
 * no query at all. Running the ten shared seeds against such a source would fetch
 * the same feed ten times over.
 */
export const UNQUERIED: readonly IngestionSeed[] = [{}];

/**
 * Per-source overrides, keyed by `SourceDescriptor.key`.
 *
 * Naming a source key here is not a dependency on that source's *format* — §4.2
 * forbids reading a source-specific field, and this reads none. `ingestion` already
 * addresses sources by key everywhere else, since that is how a run is requested.
 */
const SOURCE_SEEDS: Readonly<Record<string, readonly IngestionSeed[]>> = {
  // The fixture adapter reads a local file and ignores `query` entirely, so it is
  // the §6 "no query" case by construction. Written as a literal rather than
  // imported from the adapter: §6.1 lets nothing outside `sources/` name a concrete
  // adapter, and `sources.imports.spec.ts` enforces it. A key is not a field name —
  // it is `JobSource.key`, the string every caller already addresses a source by.
  'fixture-board': UNQUERIED,
};

/** The seeds one run walks, in order. Never empty. */
export function seedsFor(sourceKey: string): readonly IngestionSeed[] {
  const seeds = SOURCE_SEEDS[sourceKey] ?? DEFAULT_SEEDS;
  // An override declared as `[]` would silently walk nothing and report a clean,
  // empty, successful run — the hardest kind of misconfiguration to notice.
  return seeds.length > 0 ? seeds : UNQUERIED;
}
