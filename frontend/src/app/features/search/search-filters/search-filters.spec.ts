import { TestBed } from '@angular/core/testing';
import { SearchQuery } from '../../../core/models/search';
import { SearchFilters } from './search-filters';

function render(query: SearchQuery = {}) {
  const fixture = TestBed.createComponent(SearchFilters);
  fixture.componentRef.setInput('query', query);

  const applied: SearchQuery[] = [];
  fixture.componentInstance.apply.subscribe((next) => applied.push(next));
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    Array.from(element.querySelectorAll('button')).find(
      (node) => node.textContent?.trim() === label,
    )!;

  return {
    fixture,
    element,
    applied,
    field: <T extends HTMLElement>(selector: string) => element.querySelector<T>(selector)!,
    checkbox: (label: string) =>
      Array.from(element.querySelectorAll('label.filters__choice')).find((node) =>
        node.textContent?.includes(label),
      )!.firstElementChild as HTMLInputElement,
    type(selector: string, value: string) {
      const input = element.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    },
    /** Every list field in the panel commits what was typed on Enter (M11.12). */
    pressEnter(selector: string) {
      element
        .querySelector<HTMLInputElement>(selector)!
        .dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true }),
        );
      fixture.detectChanges();
    },
    toggle(label: string) {
      this.checkbox(label).dispatchEvent(new Event('change'));
      fixture.detectChanges();
    },
    submit() {
      element.querySelector('form')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
    },
    click(label: string) {
      button(label).click();
      fixture.detectChanges();
    },
    setQuery(next: SearchQuery) {
      fixture.componentRef.setInput('query', next);
      fixture.detectChanges();
    },
  };
}

describe('SearchFilters', () => {
  it('shows the URL it was given, so a shared link arrives with its filters on', () => {
    const panel = render({ q: 'java', workplaceType: ['REMOTE'], minJuniorScore: 70 });

    expect(panel.field<HTMLInputElement>('#search-q').value).toBe('java');
    expect(panel.checkbox('Remote').checked).toBe(true);
    expect(panel.field<HTMLInputElement>('#search-min-score').value).toBe('70');
  });

  it('says how many filters are on', () => {
    expect(
      render({ workplaceType: ['REMOTE'], juniorLevel: ['ENTRY_LEVEL'] }).element.textContent,
    ).toContain('2 on');
  });

  it('does not count the search text as a filter on it', () => {
    expect(render({ q: 'java' }).element.querySelector('.filters__count')).toBeNull();
  });

  it('opens itself when the URL already carries filters', () => {
    expect(render({ workplaceType: ['REMOTE'] }).field<HTMLDetailsElement>('details').open).toBe(
      true,
    );
    expect(render({ q: 'java' }).field<HTMLDetailsElement>('details').open).toBe(false);
  });

  it('emits what was typed as the query', () => {
    const panel = render();
    panel.type('#search-q', '  junior java  ');
    panel.submit();

    expect(panel.applied).toEqual([{ q: 'junior java' }]);
  });

  it('emits nothing for a field the user left alone', () => {
    const panel = render();
    panel.submit();

    expect(panel.applied).toEqual([{}]);
  });

  it('turns a checkbox into a list filter, and off again', () => {
    const panel = render();
    panel.toggle('Remote');
    panel.toggle('Hybrid');
    panel.submit();
    panel.toggle('Remote');
    panel.submit();

    expect(panel.applied).toEqual([
      { workplaceType: ['REMOTE', 'HYBRID'] },
      { workplaceType: ['HYBRID'] },
    ]);
  });

  /**
   * Naming a level is how `PRODUCT.md` §8's default result set is opted out of, so
   * the panel has to be able to ask for the bands it hides by default.
   */
  it('can ask for the experienced bands the default result set leaves out', () => {
    const panel = render();
    panel.toggle('Clearly experienced');
    panel.submit();

    expect(panel.applied).toEqual([{ juniorLevel: ['CLEARLY_EXPERIENCED'] }]);
  });

  // The country field is a searchable dropdown over the full ISO list: typing
  // a name and pressing Enter picks the top match and stores its alpha-2
  // code, not what was typed — the same field the profile's "Countries" uses.
  it('resolves a typed country name to its ISO alpha-2 code', () => {
    const panel = render();
    panel.type('#search-country', 'Germany');
    panel.pressEnter('#search-country');
    panel.submit();

    expect(panel.applied).toEqual([{ countryCode: ['DE'] }]);
  });

  /**
   * "Where" (free-text location) was replaced by the country picker: a
   * database with only a handful of postings has only a handful of locations
   * to suggest, while the ISO country list is always complete. `locations`
   * itself is still round-tripped, below.
   */
  it('has no manual control for location any more', () => {
    expect(render().element.querySelector('#search-locations')).toBeNull();
  });

  it('preserves a location the URL already carries, though nothing here can edit it', () => {
    const panel = render({ locations: ['Berlin'] });
    panel.submit();

    expect(panel.applied).toEqual([{ locations: ['Berlin'] }]);
  });

  // The score is a slider now: 0 is its rest position rather than a typed
  // value, and "at least 0" would filter out nothing anyway.
  it('leaves the score filter off while the slider sits at its rest position', () => {
    const panel = render();
    panel.submit();

    expect(panel.applied).toEqual([{}]);
  });

  it('emits the score once the slider is moved off zero', () => {
    const panel = render();
    panel.type('#search-min-score', '40');
    panel.submit();

    expect(panel.applied).toEqual([{ minJuniorScore: 40 }]);
  });

  it('clears everything the user narrowed with', () => {
    const panel = render({ q: 'java', workplaceType: ['REMOTE'] });
    panel.click('Clear all');

    expect(panel.applied).toEqual([{}]);
  });

  /**
   * The URL is the truth. A draft that was never submitted is discarded when the
   * address bar moves — which is what makes the back button restore the search it
   * went back to rather than the half-typed one.
   */
  it('drops an unsubmitted edit when the URL changes underneath it', () => {
    const panel = render({ q: 'java' });
    panel.type('#search-q', 'kotlin');
    panel.setQuery({ q: 'java', workplaceType: ['REMOTE'] });

    expect(panel.field<HTMLInputElement>('#search-q').value).toBe('java');
    expect(panel.checkbox('Remote').checked).toBe(true);
  });

  it('does not emit a second search while one is in flight', () => {
    const panel = render();
    panel.fixture.componentRef.setInput('busy', true);
    panel.fixture.detectChanges();
    panel.submit();

    expect(panel.applied).toEqual([]);
  });

  /**
   * `sort` is the page's, not the panel's: applying a filter must not silently
   * reset an ordering the user chose, and "Clear all" must not have to decide
   * whether an ordering is a filter.
   */
  it('never emits a sort', () => {
    const panel = render({ q: 'java', sort: 'postedAt' });
    panel.submit();

    expect(panel.applied[0]).not.toHaveProperty('sort');
  });

  /**
   * Search is a way of saying "use what's in this panel", the same as pressing
   * Enter in the field itself — typing a country and clicking Search must not
   * discard it just because Enter was never pressed.
   */
  it('commits a country typed but not confirmed with Enter when the form is submitted', () => {
    const panel = render();
    panel.type('#search-country', 'France');
    panel.submit();

    expect(panel.applied).toEqual([{ countryCode: ['FR'] }]);
  });

  it('commits an unconfirmed technology the same way', () => {
    const panel = render();
    panel.type('#search-technologies', 'java');
    panel.submit();

    expect(panel.applied).toEqual([{ technologies: ['java'] }]);
  });

  /**
   * `novalidate` turns off the browser's own bounds checking, so the form has to
   * enforce them itself — otherwise a value outside range submits clean and then
   * vanishes silently the next time it round-trips through the URL, with nothing
   * on screen to say why. The score filter has no such test any more: a range
   * input cannot be driven past its `max` attribute from the UI in the first
   * place, so there is nothing here for the form to refuse.
   */
  it('refuses years-required above the field’s own maximum', () => {
    const panel = render();
    panel.type('#search-max-years', '999');
    panel.submit();

    expect(panel.applied).toEqual([]);
    expect(panel.field<HTMLInputElement>('#search-max-years').getAttribute('aria-invalid')).toBe(
      'true',
    );
  });

  /**
   * The score/years/posted trio sits under its own "More filters" disclosure,
   * nested inside the panel's — a screen-reader user tabbing through hears one
   * named group rather than three unrelated fields with no shared context.
   */
  it('groups the score, years and posted-within fields under one disclosure', () => {
    const panel = render();
    const scoreField = panel.field<HTMLInputElement>('#search-min-score');
    const group = scoreField.closest('details')!;

    expect(group).not.toBeNull();
    expect(group.querySelector('summary')?.textContent?.trim()).toBe('More filters');
    expect(group.contains(panel.field('#search-max-years'))).toBe(true);
    expect(group.contains(panel.field('#search-posted-within'))).toBe(true);
  });

  it('starts the "More filters" disclosure closed with nothing in it set', () => {
    expect(render().field<HTMLInputElement>('#search-min-score').closest('details')!.open).toBe(
      false,
    );
  });

  it('opens "More filters" when the URL already narrows by one of its fields', () => {
    expect(
      render({ maxYearsRequired: 2 })
        .field<HTMLInputElement>('#search-min-score')
        .closest('details')!.open,
    ).toBe(true);
  });
});
