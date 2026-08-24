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

  it('upper-cases a country code, which the API matches exactly', () => {
    const panel = render();
    panel.type('#search-country', 'de');
    panel.submit();

    expect(panel.applied).toEqual([{ countryCode: 'DE' }]);
  });

  it('keeps a zero, which is a filter and not an empty field', () => {
    const panel = render();
    panel.type('#search-min-score', '0');
    panel.submit();

    expect(panel.applied).toEqual([{ minJuniorScore: 0 }]);
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
});
