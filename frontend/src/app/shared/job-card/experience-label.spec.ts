import { formatExperience } from './experience-label';

describe('formatExperience', () => {
  it('renders a range as a range', () => {
    expect(formatExperience(0, 1)).toBe('0–1 years');
    expect(formatExperience(1, 2)).toBe('1–2 years');
  });

  it('renders a floor as a floor, not as a range of one value', () => {
    expect(formatExperience(3, null)).toBe('3+ years');
    expect(formatExperience(5, null)).toBe('5+ years');
  });

  it('renders a ceiling as an upper bound', () => {
    expect(formatExperience(null, 2)).toBe('Up to 2 years');
    expect(formatExperience(null, 1)).toBe('Up to 1 year');
  });

  it('renders equal bounds as one figure', () => {
    expect(formatExperience(2, 2)).toBe('2 years');
    expect(formatExperience(1, 1)).toBe('1 year');
  });

  it('reports nothing when the posting stated no figure', () => {
    expect(formatExperience(null, null)).toBeNull();
    expect(formatExperience(undefined, undefined)).toBeNull();
  });

  it('keeps a stated zero, which is a requirement and not an absence', () => {
    expect(formatExperience(0, null)).toBe('0+ years');
    expect(formatExperience(0, 0)).toBe('0 years');
  });
});
