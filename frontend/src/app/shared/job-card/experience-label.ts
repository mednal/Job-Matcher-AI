/**
 * The stated experience requirement, worded the way the posting stated it.
 *
 * The two bounds are independent and each can be absent, and the four cases mean
 * genuinely different things — a floor is a barrier, a ceiling is an invitation,
 * and neither is the same as a range. Collapsing them (say, always printing
 * `min–max`) would turn "at least 3 years" into "3–3 years", which is a claim the
 * posting never made.
 *
 * `null` means the posting stated no figure at all. That is worth telling the user
 * rather than hiding, so the caller renders it as "Not stated" instead of dropping
 * the row: an unstated requirement is exactly the ambiguity this product exists to
 * surface.
 */
export function formatExperience(
  minYears: number | null | undefined,
  maxYears: number | null | undefined,
): string | null {
  const min = minYears ?? null;
  const max = maxYears ?? null;

  if (min === null && max === null) {
    return null;
  }

  if (min !== null && max !== null) {
    return min === max ? years(min) : `${min}–${max} years`;
  }

  if (min !== null) {
    return `${min}+ years`;
  }

  return `Up to ${years(max as number)}`;
}

function years(value: number): string {
  return value === 1 ? '1 year' : `${value} years`;
}
