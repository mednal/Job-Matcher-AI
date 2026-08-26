import { languageLabel } from './language-label';

describe('languageLabel', () => {
  it('names the languages the seeded jobs are written in', () => {
    expect(languageLabel('en')).toBe('English');
    expect(languageLabel('de')).toBe('German');
  });

  it('falls back to the uppercased code when the tag has no name', () => {
    expect(languageLabel('zz')).toBe('ZZ');
  });

  it('does not throw on an ill-formed tag', () => {
    expect(languageLabel('not a tag')).toBe('NOT A TAG');
  });

  it('answers nothing for a missing language', () => {
    expect(languageLabel(null)).toBeNull();
    expect(languageLabel('  ')).toBeNull();
  });
});
