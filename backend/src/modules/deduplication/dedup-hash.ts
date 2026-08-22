import { createHash } from 'crypto';

/**
 * `Job.dedupHash` — the exact-match clustering key of dedup tier 2
 * (M7.2, D1, `ARCHITECTURE.md` §6.3).
 *
 *     dedupHash = sha256(companySlug | normalizedTitle | countryCode)
 *
 * The column is `UNIQUE`, so this hash is not merely a lookup key: it is the
 * database's guarantee that two canonical jobs cannot exist for the same vacancy.
 * A concurrent insert therefore fails with `P2002` and is resolved as a match, not
 * an error (D1) — `CanonicalJobService` owns that path.
 *
 * **The literal `|` separator and the empty string for a missing country are the
 * format `prisma/seed.ts` already writes.** They are matched exactly, not
 * re-invented: the seeded jobs are the corpus Phases 6–8 are checked against, and a
 * different byte layout here would mean an ingested posting silently created a
 * second `Job` beside its seeded twin instead of attaching to it.
 *
 * Unlike `postingContentHash`, this does not need a NUL separator or JSON encoding.
 * Its three inputs are drawn from restricted alphabets — `companySlug` is
 * `[a-z0-9-]`, `normalizedTitle` is `[a-z0-9 ]`, `countryCode` is two letters — so
 * none of them can contain a `|` and shift content across a field boundary.
 *
 * Changing any input rule invalidates every stored hash and requires the recompute
 * migration of `DATABASE.md` §6.
 */
export interface DedupHashInput {
  /** From `toCompanySlug` (M6.2). */
  readonly companySlug: string;
  /** From `toNormalizedTitle` (M7.2). */
  readonly normalizedTitle: string;
  /** ISO-3166 alpha-2, or null when the source published no usable location. */
  readonly countryCode: string | null;
}

export function dedupHash(input: DedupHashInput): string {
  // Uppercased to match the column: `DATABASE.md` §6 fixes `countryCode` as
  // uppercase alpha-2, and a source that wrote "de" must hash like one that wrote
  // "DE". Null and "" collapse to the same key on purpose — both mean "country
  // unknown", and tier 3 is what separates two same-titled vacancies that landed
  // there from different countries.
  const country = (input.countryCode ?? '').trim().toUpperCase();

  return createHash('sha256')
    .update(`${input.companySlug}|${input.normalizedTitle}|${country}`, 'utf8')
    .digest('hex');
}
