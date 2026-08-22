import type { EmploymentType, WorkplaceType } from '@prisma/client';

/**
 * M7.4 — choosing a cluster's canonical field values (`ARCHITECTURE.md` §6.3).
 *
 * A `Job` clusters N postings of one vacancy, but the user is shown one title, one
 * description and one set of technologies. §6.3 says which posting supplies them:
 * **the one with the richest description**. Every source URL stays reachable
 * through the `postings` relation regardless, so nothing is lost by not being
 * chosen — only the displayed copy is at stake.
 *
 * The choice is a **pure function of the posting rows**, deliberately: tiers 2 and
 * 3 attach postings in whatever order a run happens to fetch them, and a rule that
 * depended on that order would make the canonical copy flip between runs for no
 * reason a user could see. Two runs over the same rows, in any order, must land on
 * the same posting — which is why the tie-breaks below go all the way down to a
 * total order on `id`.
 *
 * **Identity columns are not canonical values and never move**: `dedupHash`,
 * `normalizedTitle`, `companySlug` and `countryCode` stay as the posting that
 * opened the job wrote them. See `canonicalValuesFrom` for why.
 */

/** The posting columns the choice reads. */
export interface CanonicalCandidate {
  readonly id: string;
  readonly isActive: boolean;
  readonly firstSeenAt: Date;
  readonly title: string;
  readonly companyName: string;
  readonly location: string | null;
  readonly workplaceType: WorkplaceType | null;
  readonly employmentType: EmploymentType | null;
  readonly language: string;
  readonly description: string;
  readonly technologies: readonly string[];
  readonly postedAt: Date | null;
}

/** The `Job` columns the result is compared against and written to. */
export interface CanonicalValues {
  readonly title: string;
  readonly companyName: string;
  readonly location: string | null;
  readonly workplaceType: WorkplaceType | null;
  readonly employmentType: EmploymentType | null;
  readonly language: string;
  readonly description: string;
  readonly technologies: string[];
  readonly postedAt: Date | null;
  readonly effectivePostedAt: Date;
}

/**
 * Picks the posting whose values the `Job` should carry, or null when the cluster
 * has no postings at all (reachable only through `onDelete: SetNull`, and a caller
 * that gets null should leave the job as it stands rather than blank it).
 *
 * **Retired postings lose to live ones.** A posting the source stopped listing
 * (M5.6 clears `isActive`) describes a vacancy that is no longer advertised there,
 * so an active sibling's copy is the better one to show. When *every* posting is
 * retired the whole pool is used again rather than returning null: a job whose
 * sources all went quiet should keep describing something until the sweep retires
 * the job itself.
 */
export function pickCanonicalPosting<T extends CanonicalCandidate>(
  postings: readonly T[],
): T | null {
  const live = postings.filter((posting) => posting.isActive);
  const pool = live.length > 0 ? live : postings;
  if (pool.length === 0) {
    return null;
  }
  return [...pool].sort(byRichestDescription)[0];
}

/**
 * "Richest" is measured as description length, then broken by two tie-breaks that
 * exist purely to make the result independent of input order.
 *
 * Length rather than distinct-token count: the descriptions reaching here are
 * already normalized plain text (M6.1), so length is a fair proxy for how much the
 * ad actually says, and it is the measure §6.3 names. A long ad padded with
 * boilerplate can win over a shorter, denser one — accepted, because that failure
 * shows the user a wordier copy of the right vacancy, not a wrong one.
 *
 * First tie-break is `firstSeenAt`, so the copy the product has been showing keeps
 * winning against an equally long newcomer — canonical text should not churn.
 * `id` is last and settles what the clock cannot, including two postings inserted
 * in the same millisecond.
 */
function byRichestDescription(
  a: CanonicalCandidate,
  b: CanonicalCandidate,
): number {
  if (a.description.length !== b.description.length) {
    return b.description.length - a.description.length;
  }
  if (a.firstSeenAt.getTime() !== b.firstSeenAt.getTime()) {
    return a.firstSeenAt.getTime() - b.firstSeenAt.getTime();
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

/**
 * The canonical block as it should stand, given the chosen posting and the job's
 * current `effectivePostedAt`.
 *
 * **What is deliberately absent from the returned object:**
 *
 * - `dedupHash`, `normalizedTitle`, `companySlug`, `countryCode` — the cluster's
 *   identity. `dedupHash` is `sha256(companySlug | normalizedTitle | countryCode)`
 *   and UNIQUE (D1); recomputing it from a different posting could collide with a
 *   hash another `Job` already holds, which the index cannot store, and would
 *   silently move the row tier 2 finds for the original spelling. Freezing all
 *   four keeps the key meaning exactly one thing — the same reason M7.3 leaves the
 *   hash of a fuzzy-matched job alone. The visible cost is that a job opened from
 *   a posting with no country keeps `countryCode = null` even after a posting that
 *   names one joins it: that direction only makes the country filter miss the job,
 *   never file it under a country it is not in.
 * - `firstSeenAt`, `lastSeenAt`, `isActive` — run bookkeeping, written by the
 *   tiers and the M5.6 sweep.
 * - the classification block — Phase 8's, and re-deciding it here would mean
 *   classifying without the classifier.
 *
 * `title` moving while `normalizedTitle` stays put means the two can disagree; that
 * is intended. The stored `normalizedTitle` is tier 3's match key, not a view of
 * the displayed title, and re-deriving it would change what future postings match
 * against every time a wordier ad arrived.
 *
 * `effectivePostedAt` follows `postedAt` only when the chosen posting has one.
 * Falling back to "now" instead would jump the job to the top of the recency sort
 * because its canonical copy changed, which is not new information — `DATABASE.md`
 * §3.3 wants that column stable.
 */
export function canonicalValuesFrom(
  winner: CanonicalCandidate,
  current: { readonly effectivePostedAt: Date },
): CanonicalValues {
  return {
    title: winner.title,
    companyName: winner.companyName,
    location: winner.location,
    workplaceType: winner.workplaceType,
    employmentType: winner.employmentType,
    language: winner.language,
    description: winner.description,
    technologies: [...winner.technologies],
    postedAt: winner.postedAt,
    effectivePostedAt: winner.postedAt ?? current.effectivePostedAt,
  };
}

/**
 * The same values, or null when the job already carries every one of them — so the
 * common case, a re-ingested posting nobody edited, costs a read and no write.
 */
export function changedCanonicalValues(
  winner: CanonicalCandidate,
  current: CanonicalValues,
): CanonicalValues | null {
  const next = canonicalValuesFrom(winner, current);
  return equalCanonicalValues(next, current) ? null : next;
}

function equalCanonicalValues(a: CanonicalValues, b: CanonicalValues): boolean {
  return (
    a.title === b.title &&
    a.companyName === b.companyName &&
    a.location === b.location &&
    a.workplaceType === b.workplaceType &&
    a.employmentType === b.employmentType &&
    a.language === b.language &&
    a.description === b.description &&
    sameOrder(a.technologies, b.technologies) &&
    sameInstant(a.postedAt, b.postedAt) &&
    sameInstant(a.effectivePostedAt, b.effectivePostedAt)
  );
}

/**
 * Order matters here, unlike in `postingContentHash` where `technologies` is
 * hashed as the set it is: the column keeps the extractor's order (M6.3) and the
 * UI renders it, so a reordering is a real change to what the user sees.
 */
function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

function sameInstant(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.getTime() === b.getTime();
}
