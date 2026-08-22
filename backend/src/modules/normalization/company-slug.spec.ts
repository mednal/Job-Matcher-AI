import { toCompanySlug } from './company-slug';

describe('toCompanySlug', () => {
  it('returns an empty string for an absent name', () => {
    expect(toCompanySlug('')).toBe('');
    expect(toCompanySlug(null)).toBe('');
    expect(toCompanySlug(undefined)).toBe('');
    expect(toCompanySlug('   ')).toBe('');
    expect(toCompanySlug('---')).toBe('');
  });

  it('lowercases and hyphenates', () => {
    expect(toCompanySlug('Nordlicht Software')).toBe('nordlicht-software');
    expect(toCompanySlug('NORDLICHT   SOFTWARE')).toBe('nordlicht-software');
  });

  describe('legal forms', () => {
    it('produces one slug for the milestone case', () => {
      // MILESTONES.md M6.2: "Example GmbH" and "Example Gmbh." are one slug.
      expect(toCompanySlug('Example GmbH')).toBe('example');
      expect(toCompanySlug('Example Gmbh.')).toBe('example');
      expect(toCompanySlug('EXAMPLE gmbh')).toBe('example');
    });

    it('strips the German forms, including the compound ones', () => {
      expect(toCompanySlug('Nordlicht Software GmbH & Co. KG')).toBe(
        'nordlicht-software',
      );
      expect(toCompanySlug('Kranich Digital AG')).toBe('kranich-digital');
      expect(toCompanySlug('Stahlwerk e.K.')).toBe('stahlwerk');
      expect(toCompanySlug('Alpenblick UG (haftungsbeschränkt)')).toBe(
        'alpenblick',
      );
    });

    it('strips the English forms', () => {
      expect(toCompanySlug('Aurelia Systems Ltd')).toBe('aurelia-systems');
      expect(toCompanySlug('Aurelia Systems Limited')).toBe('aurelia-systems');
      expect(toCompanySlug('Aurelia Systems, Inc.')).toBe('aurelia-systems');
      expect(toCompanySlug('Aurelia Systems Pty Ltd')).toBe('aurelia-systems');
    });

    it('strips the forms that survive punctuation removal as several tokens', () => {
      expect(toCompanySlug('Novo Systems A/S')).toBe('novo-systems');
      expect(toCompanySlug('Lumiere Conseil S.à r.l.')).toBe('lumiere-conseil');
      expect(toCompanySlug('Wisla Tech sp. z o.o.')).toBe('wisla-tech');
    });

    it('only strips a legal form at the end of the name', () => {
      // "AG" and "Inc" are ordinary words elsewhere; removing them there would fold
      // unrelated employers into one dedup partition.
      expect(toCompanySlug('AG Solutions GmbH')).toBe('ag-solutions');
      expect(toCompanySlug('Inc Magazin Verlag')).toBe('inc-magazin-verlag');
    });

    it('keeps the legal form when it is the whole name', () => {
      // An empty slug would partition every such company together — the collision
      // this function exists to prevent.
      expect(toCompanySlug('Limited')).toBe('limited');
      expect(toCompanySlug('GmbH')).toBe('gmbh');
    });
  });

  describe('diacritics', () => {
    it('folds the German spellings onto one slug', () => {
      // The same employer reaches us all three ways: a German board, an English
      // aggregator, and an ATS that lost its encoding.
      expect(toCompanySlug('Müller Software GmbH')).toBe('mueller-software');
      expect(toCompanySlug('Mueller Software GmbH')).toBe('mueller-software');
    });

    it('strips other diacritics to their base letter', () => {
      expect(toCompanySlug('Société Générale Tech')).toBe(
        'societe-generale-tech',
      );
      expect(toCompanySlug('Beißner Systeme')).toBe('beissner-systeme');
    });
  });

  describe('punctuation', () => {
    it('joins what an abbreviation dot or an apostrophe touches', () => {
      expect(toCompanySlug("O'Brien Consulting")).toBe('obrien-consulting');
      expect(toCompanySlug('OBrien Consulting')).toBe('obrien-consulting');
      expect(toCompanySlug('O’Brien Consulting')).toBe('obrien-consulting');
    });

    it('treats every other separator as a word boundary', () => {
      expect(toCompanySlug('Smith & Sons')).toBe('smith-sons');
      expect(toCompanySlug('Smith/Sons')).toBe('smith-sons');
      expect(toCompanySlug('Smith — Sons')).toBe('smith-sons');
    });

    it('keeps digits, which are part of the name', () => {
      expect(toCompanySlug('Studio 42 GmbH')).toBe('studio-42');
    });
  });

  it('is idempotent on its own output', () => {
    // A recompute migration (DATABASE.md §6) may re-slug a stored value; a second
    // pass must not change it.
    const once = toCompanySlug('Nordlicht Software GmbH & Co. KG');
    expect(toCompanySlug(once)).toBe(once);
  });

  it('does not collide two different employers', () => {
    expect(toCompanySlug('Nordlicht Software GmbH')).not.toBe(
      toCompanySlug('Nordlicht Systems GmbH'),
    );
  });
});
