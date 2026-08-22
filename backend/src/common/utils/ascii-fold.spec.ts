import { foldToAscii } from './ascii-fold';

describe('foldToAscii', () => {
  it('lowercases', () => {
    expect(foldToAscii('Berlin')).toBe('berlin');
  });

  it('expands the German characters rather than stripping their marks', () => {
    // "Mueller" is how the name is actually transliterated by the sources that
    // cannot write it; stripping the mark would give "muller", which matches
    // neither the German nor the English spelling.
    expect(foldToAscii('Müller')).toBe('mueller');
    expect(foldToAscii('Grün')).toBe('gruen');
    expect(foldToAscii('Beißner')).toBe('beissner');
    expect(foldToAscii('Öl AG')).toBe('oel ag');
  });

  it('strips other combining marks to the base letter', () => {
    expect(foldToAscii('Société')).toBe('societe');
    expect(foldToAscii('Zürich')).toBe('zuerich');
    expect(foldToAscii('Málaga')).toBe('malaga');
  });

  it('folds the letters that carry no combining mark', () => {
    expect(foldToAscii('Nørresundby')).toBe('norresundby');
    expect(foldToAscii('Łódź')).toBe('lodz');
  });

  it('leaves punctuation and whitespace alone', () => {
    // Callers disagree about them: a slug removes them, a country lookup collapses
    // them. Folding must not decide for either.
    expect(foldToAscii('S.à r.l. ')).toBe('s.a r.l. ');
  });

  it('is idempotent', () => {
    const once = foldToAscii('Müller & Söhne GmbH');
    expect(foldToAscii(once)).toBe(once);
  });
});
