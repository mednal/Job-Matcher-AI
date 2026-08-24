/**
 * How long ago a job was posted, in words.
 *
 * Relative rather than a calendar date, because the only question a reader has
 * about a posting's date is whether it is still worth applying to. The precision
 * drops off with age on purpose — "3 days ago" is actionable, "on 14 March" is a
 * subtraction the reader has to do themselves.
 *
 * `now` is a parameter rather than a `Date.now()` call inside, so the wording is a
 * pure function of its inputs and can be tested without freezing the clock.
 */
export function postedLabel(iso: string, now: Date = new Date()): string | null {
  const posted = new Date(iso);
  if (Number.isNaN(posted.getTime())) {
    return null;
  }

  const days = Math.floor((now.getTime() - posted.getTime()) / 86_400_000);

  // A future date is clock skew between the source and this machine, not a
  // scheduled posting. "In 2 days" would read as a defect; "today" is harmless.
  if (days <= 0) {
    return 'today';
  }
  if (days === 1) {
    return 'yesterday';
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  if (days < 35) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? 'a week ago' : `${weeks} weeks ago`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return months === 1 ? 'a month ago' : `${months} months ago`;
  }
  return 'over a year ago';
}
