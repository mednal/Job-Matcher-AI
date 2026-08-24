import { postedLabel } from './posted-label';

const NOW = new Date('2026-08-23T12:00:00.000Z');

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

describe('postedLabel', () => {
  it('words the first week in days', () => {
    expect(postedLabel(daysAgo(0), NOW)).toBe('today');
    expect(postedLabel(daysAgo(1), NOW)).toBe('yesterday');
    expect(postedLabel(daysAgo(3), NOW)).toBe('3 days ago');
    expect(postedLabel(daysAgo(6), NOW)).toBe('6 days ago');
  });

  it('drops to weeks, then months, as the date ages', () => {
    expect(postedLabel(daysAgo(7), NOW)).toBe('a week ago');
    expect(postedLabel(daysAgo(20), NOW)).toBe('2 weeks ago');
    expect(postedLabel(daysAgo(40), NOW)).toBe('a month ago');
    expect(postedLabel(daysAgo(200), NOW)).toBe('6 months ago');
    expect(postedLabel(daysAgo(500), NOW)).toBe('over a year ago');
  });

  it('treats a future date as today rather than counting forwards', () => {
    expect(postedLabel(daysAgo(-3), NOW)).toBe('today');
  });

  it('reports nothing for a date it cannot read', () => {
    expect(postedLabel('not a date', NOW)).toBeNull();
  });
});
