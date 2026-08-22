import { createHash } from 'crypto';
import type { EmploymentType, WorkplaceType } from '@prisma/client';

/**
 * `JobPosting.contentHash` — the change-detection key of tier 1 (M7.1).
 *
 * Not to be confused with `RawJobDocument.contentHash`, which hashes the *source
 * payload* (`ingestion/payload-canonicalization.ts`). This one hashes the
 * *normalized posting*, after normalization has run, and answers a different
 * question: "would writing this posting change any column?".
 *
 * It therefore covers **every mutable column the upsert writes** rather than only
 * the fields the classifier reads. The schema comment calls the column "skip
 * re-classify when unchanged", and a hash over a superset still answers that
 * correctly — it can only make a run re-classify a posting whose URL changed, never
 * skip one whose description did. Hashing the narrower set would have the opposite
 * failure: a changed URL would hash equal, so the row would never be corrected.
 *
 * Lifecycle columns — `firstSeenAt`, `lastSeenAt`, `isActive`, `jobId` — are
 * excluded on purpose. They record what ingestion observed, not what the source
 * published, and folding them in would make every run's hash differ from the last.
 */
export interface HashablePosting {
  readonly url: string;
  readonly title: string;
  readonly companyName: string;
  readonly companySlug: string;
  readonly location: string | null;
  readonly countryCode: string | null;
  readonly workplaceType: WorkplaceType | null;
  readonly employmentType: EmploymentType | null;
  readonly language: string;
  readonly description: string;
  readonly technologies: readonly string[];
  readonly postedAt: Date | null;
}

/**
 * NUL, not a printable character. Fields are concatenated, so the separator has to
 * be one that cannot occur inside a value: with a printable delimiter,
 * `title = "a|b", company = "c"` and `title = "a", company = "b|c"` would hash
 * identically. `normalizePlainText` (M6.1) strips control characters, so no field
 * reaching this function can contain one.
 */
const FIELD_SEPARATOR = String.fromCharCode(0);

export function postingContentHash(posting: HashablePosting): string {
  // Each field is JSON-encoded rather than pasted in raw, so `null` and `""` are
  // different inputs. Both are real states here — a source that drops a location
  // and one that publishes a blank one are different postings, and collapsing them
  // would leave the blank in the column forever.
  const parts: readonly string[] = [
    posting.url,
    posting.title,
    posting.companyName,
    posting.companySlug,
    posting.location,
    posting.countryCode,
    posting.workplaceType,
    posting.employmentType,
    posting.language,
    posting.description,
    // `technologies` is a set, not a sequence: the same technologies in a different
    // order are the same posting, and sorting here keeps a dictionary reordering in
    // a future `technologies.ts` from marking every posting in the database as
    // changed. The stored column keeps the extractor's own order.
    [...posting.technologies].sort().join(','),
    posting.postedAt ? posting.postedAt.toISOString() : null,
  ].map((value) => JSON.stringify(value ?? null));

  return createHash('sha256').update(parts.join(FIELD_SEPARATOR)).digest('hex');
}
