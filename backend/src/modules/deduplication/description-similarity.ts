import { foldToAscii } from '../../common/utils/ascii-fold';

/**
 * The description confirmation of deduplication tier 3 (M7.3,
 * `ARCHITECTURE.md` §6.3).
 *
 * Tier 3's first gate is a trigram similarity on `normalizedTitle` inside one
 * `companySlug`. That gate alone is not enough to merge on: within a single company
 * a handful of genuinely different vacancies share almost all of their title words,
 * and `normalizedTitle` has already had the seniority words removed. §6.3 therefore
 * requires the title match to be **confirmed by a description similarity check**,
 * and this file is that check.
 *
 * It is a token-set Jaccard rather than a trigram similarity, deliberately:
 *
 * - Descriptions are long. `similarity()` over two multi-kilobyte texts is
 *   expensive, and it is dominated by shared boilerplate character sequences rather
 *   than by shared vocabulary.
 * - Two listings of one vacancy on two boards are usually the same copy with a
 *   different wrapper — the same words in the same order, plus or minus a benefits
 *   block. Set overlap reads that well.
 * - It is pure and synchronous, so the threshold can be pinned by unit tests
 *   instead of only in an integration test against a live database.
 *
 * The comparison folds to ASCII by the same table `normalizedTitle` and
 * `companySlug` use, so a description that lost its encoding on one board still
 * matches its properly encoded twin on another.
 */

/**
 * Short tokens are dropped. In both supported languages they are function words
 * (`the`, `and`, `für`, `mit`) plus list bullets and stray numbers — present in
 * every posting, so they inflate the overlap of two unrelated ads without carrying
 * evidence that the vacancy is the same one.
 */
const MIN_TOKEN_LENGTH = 3;

/**
 * Below this many distinct tokens on either side, the check returns "no opinion"
 * rather than a number. A two-line description does not confirm anything: a handful
 * of tokens can reach any score by accident in either direction, and tier 3 must
 * not merge on an accident. Callers treat "no opinion" as unconfirmed, which means
 * a new `Job` — the split-biased default of §6.3.
 */
export const MIN_CONFIRMABLE_TOKENS = 12;

/**
 * The distinct vocabulary of a description, ASCII-folded and lowercased.
 *
 * A set, not a bag: repeating "Kubernetes" nine times says the posting is about
 * Kubernetes, not that it is nine times more similar to another posting that
 * mentions it once.
 */
export function descriptionTokens(
  text: string | null | undefined,
): ReadonlySet<string> {
  if (!text) {
    return new Set();
  }

  const tokens = new Set<string>();
  for (const token of foldToAscii(text).split(/[^a-z0-9]+/)) {
    if (token.length >= MIN_TOKEN_LENGTH) {
      tokens.add(token);
    }
  }
  return tokens;
}

/**
 * Jaccard overlap of two descriptions' vocabularies, in `[0, 1]`.
 *
 * Returns `null` when either side is too short to carry evidence
 * (`MIN_CONFIRMABLE_TOKENS`) — "unknown", which is not the same answer as `0` and
 * is logged differently by the caller.
 *
 * Jaccard rather than the overlap coefficient (`shared / min(size)`): the overlap
 * coefficient scores a short generic ad against a long one very highly, since the
 * short side is nearly a subset of the long side's vocabulary. That is exactly the
 * false merge §6.3 says to avoid, so the harsher measure is the right one here.
 */
export function descriptionSimilarity(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  const left = descriptionTokens(a);
  const right = descriptionTokens(b);

  if (
    left.size < MIN_CONFIRMABLE_TOKENS ||
    right.size < MIN_CONFIRMABLE_TOKENS
  ) {
    return null;
  }

  const [smaller, larger] =
    left.size <= right.size ? [left, right] : [right, left];
  let shared = 0;
  for (const token of smaller) {
    if (larger.has(token)) {
      shared += 1;
    }
  }

  return shared / (left.size + right.size - shared);
}
