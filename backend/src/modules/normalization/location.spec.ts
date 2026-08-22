import { parseLocation } from './location';

describe('parseLocation', () => {
  it('treats an absent location as neither a place nor a country', () => {
    expect(parseLocation('')).toEqual({ location: null, countryCode: null });
    expect(parseLocation(null)).toEqual({ location: null, countryCode: null });
    expect(parseLocation(undefined)).toEqual({
      location: null,
      countryCode: null,
    });
    expect(parseLocation('   ')).toEqual({ location: null, countryCode: null });
  });

  describe('country recognition', () => {
    it('splits "City, Country"', () => {
      expect(parseLocation('Berlin, Germany')).toEqual({
        location: 'Berlin',
        countryCode: 'DE',
      });
      expect(parseLocation('Dublin, Ireland')).toEqual({
        location: 'Dublin',
        countryCode: 'IE',
      });
    });

    it('recognizes the German spelling of a country', () => {
      expect(parseLocation('München, Deutschland')).toEqual({
        location: 'München',
        countryCode: 'DE',
      });
      expect(parseLocation('Wien, Österreich')).toEqual({
        location: 'Wien',
        countryCode: 'AT',
      });
    });

    it('recognizes alpha-2 and alpha-3 codes, dotted or not', () => {
      expect(parseLocation('Berlin, DE').countryCode).toBe('DE');
      expect(parseLocation('Berlin, deu').countryCode).toBe('DE');
      expect(parseLocation('New York, U.S.A.').countryCode).toBe('US');
      expect(parseLocation('London, U.K.').countryCode).toBe('GB');
    });

    it('maps the constituent countries of the UK onto GB', () => {
      expect(parseLocation('Manchester, England').countryCode).toBe('GB');
      expect(parseLocation('Edinburgh, Scotland').countryCode).toBe('GB');
      expect(parseLocation('London, United Kingdom').countryCode).toBe('GB');
    });

    it('returns only a country when that is all the source gave', () => {
      expect(parseLocation('Germany')).toEqual({
        location: null,
        countryCode: 'DE',
      });
    });

    it('leaves an unknown trailing segment in the display value', () => {
      expect(parseLocation('Berlin, Mitte')).toEqual({
        location: 'Berlin, Mitte',
        countryCode: null,
      });
    });
  });

  describe('separators', () => {
    it('reads a bracketed country', () => {
      expect(parseLocation('Remote (Germany)')).toEqual({
        location: 'Remote',
        countryCode: 'DE',
      });
    });

    it('reads a spaced dash or a pipe or a slash as a separator', () => {
      expect(parseLocation('Remote - Deutschland')).toEqual({
        location: 'Remote',
        countryCode: 'DE',
      });
      expect(parseLocation('Zürich | Schweiz')).toEqual({
        location: 'Zürich',
        countryCode: 'CH',
      });
      expect(parseLocation('Zürich/Schweiz')).toEqual({
        location: 'Zürich',
        countryCode: 'CH',
      });
    });

    it('does not split a hyphenated place name', () => {
      expect(parseLocation('Baden-Württemberg, Germany')).toEqual({
        location: 'Baden-Württemberg',
        countryCode: 'DE',
      });
    });

    it('keeps several places in the display value', () => {
      expect(parseLocation('Berlin, Hamburg, Germany')).toEqual({
        location: 'Berlin, Hamburg',
        countryCode: 'DE',
      });
    });

    it('normalizes the whitespace of the display value', () => {
      expect(parseLocation('  Berlin ,   Germany  ')).toEqual({
        location: 'Berlin',
        countryCode: 'DE',
      });
    });
  });

  describe('deliberate non-behaviour', () => {
    it('does not infer a country from a city', () => {
      // A city dictionary would risk a wrong country on the ambiguous names, and a
      // wrong country is baked into dedupHash. Dedup tier 3 covers the false split
      // this causes; nothing covers a false merge.
      expect(parseLocation('Berlin')).toEqual({
        location: 'Berlin',
        countryCode: null,
      });
      expect(parseLocation('Frankfurt')).toEqual({
        location: 'Frankfurt',
        countryCode: null,
      });
    });

    it('does not interpret a workplace marker — that is M6.3', () => {
      expect(parseLocation('Remote')).toEqual({
        location: 'Remote',
        countryCode: null,
      });
      expect(parseLocation('Hybrid, Berlin, Germany')).toEqual({
        location: 'Hybrid, Berlin',
        countryCode: 'DE',
      });
    });

    it('consumes only one country and keeps the rest as written', () => {
      expect(parseLocation('Germany, Austria')).toEqual({
        location: 'Germany',
        countryCode: 'AT',
      });
    });

    it('keeps the source spelling of the display value', () => {
      // Nothing compares `location`; folding its diacritics would only make it
      // worse to read.
      expect(parseLocation('Zürich, Schweiz').location).toBe('Zürich');
    });
  });

  it('is stable across a re-parse of its own display value', () => {
    const once = parseLocation('Berlin, Germany');
    expect(parseLocation(once.location)).toEqual({
      location: 'Berlin',
      countryCode: null,
    });
  });
});
