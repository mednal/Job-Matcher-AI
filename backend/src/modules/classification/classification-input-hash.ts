import { createHash } from 'crypto';
import type { ClassificationInput } from './junior-classifier';

/**
 * `JobClassification.inputHash` — the cache key of M8.4 (`ARCHITECTURE.md` §6.4).
 *
 * It hashes **the classifier's own input, and nothing else**: the same
 * `ClassificationInput` that `JuniorClassifier.classify` receives. That is the
 * property that makes it a correct cache key — two calls with an equal hash are
 * calls the classifier cannot distinguish, so re-running it is guaranteed to produce
 * the stored result. If `ClassificationInput` ever gains a field, it belongs here in
 * the same commit, or the cache starts serving results for text it did not see.
 *
 * It is therefore *not* `JobPosting.contentHash` (M7.1), which hashes a whole
 * normalized posting including its URL and technologies. M7.4 left Phase 8 a note
 * about exactly this: a refresh can move a `Job`'s canonical description without any
 * posting's content hash being the thing that changed, so re-classification has to
 * key on the canonical values the classifier reads. Those are the two fields below.
 *
 * The title is in the hash because `decideLevel` reads it — a job renamed from
 * "Senior" to "Junior" over the same description is a different classification and
 * must not be answered from the cache. That is the one place this diverges from
 * `prisma/seed.ts`, which hashes the description alone; the seed writes under its
 * own `seed-fixture-1.0` version, so the two key spaces never meet.
 */

/** NUL: `normalizePlainText` (M6.1) strips control characters, so no input can
 * contain one, and `title = "a", description = "b"` cannot collide with
 * `title = "ab", description = ""`. */
const FIELD_SEPARATOR = String.fromCharCode(0);

export function classificationInputHash(input: ClassificationInput): string {
  // JSON-encoded per field, so a missing description and an empty one are different
  // inputs. They are also different classifications — an empty string is a posting
  // whose body normalized to nothing — so the cache must not merge them.
  const parts = [input.title, input.description].map((value) =>
    JSON.stringify(value ?? null),
  );

  return createHash('sha256').update(parts.join(FIELD_SEPARATOR)).digest('hex');
}
