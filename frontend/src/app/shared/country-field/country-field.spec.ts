import { ComponentRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { COUNTRIES } from '../countries';
import { CountryField } from './country-field';

const codeFor = (name: string): string => COUNTRIES.find((country) => country.name === name)!.code;

function render(values: string[] = [], inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(CountryField);
  const componentRef = fixture.componentRef as ComponentRef<CountryField>;
  componentRef.setInput('label', 'Countries');
  componentRef.setInput('fieldId', 'countries');
  componentRef.setInput('values', values);
  for (const [name, value] of Object.entries(inputs)) {
    componentRef.setInput(name, value);
  }

  const emitted: string[][] = [];
  fixture.componentInstance.valuesChange.subscribe((next) => emitted.push(next));
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  const input = () => element.querySelector('input')!;

  return {
    element,
    emitted,
    input,
    chips: () =>
      Array.from(element.querySelectorAll('app-chip'), (node) =>
        node.textContent?.replace(/\s+/g, ' ').replace('×', '').trim(),
      ),
    options: () =>
      Array.from(element.querySelectorAll('[role="option"]'), (node) => node.textContent?.trim()),
    type(value: string) {
      input().value = value;
      input().dispatchEvent(new Event('input'));
      fixture.detectChanges();
    },
    keydown(key: string) {
      const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true });
      input().dispatchEvent(event);
      fixture.detectChanges();
      return event;
    },
    clickOption(name: string) {
      Array.from(element.querySelectorAll<HTMLLIElement>('[role="option"]'))
        .find((node) => node.textContent?.trim() === name)!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();
    },
    removeButton: (name: string) =>
      element.querySelector<HTMLButtonElement>(`[aria-label="Remove ${name} from Countries"]`)!,
  };
}

describe('CountryField', () => {
  it('shows each stored code as its own chip, by name rather than the raw code', () => {
    expect(render(['DE', 'FR']).chips()).toEqual(['Germany', 'France']);
  });

  it('offers no suggestions until something is typed', () => {
    expect(render([]).options()).toEqual([]);
  });

  it('suggests countries whose name matches what was typed', () => {
    const field = render([]);
    field.type('german');

    expect(field.options()).toEqual(['Germany']);
  });

  it('ranks a name starting with the query before one that only contains it', () => {
    const field = render([]);
    field.type('in');

    // India and Indonesia start with "in"; Argentina and China only contain it
    // further in, so the two prefix matches lead regardless of list order.
    const options = field.options();
    expect(options.slice(0, 2)).toEqual(['India', 'Indonesia']);
  });

  it('adds the code behind the clicked name and clears the box', () => {
    const field = render([]);
    field.type('Germany');
    field.clickOption('Germany');

    expect(field.emitted).toEqual([['DE']]);
    expect(field.input().value).toBe('');
  });

  it('picks the highlighted suggestion on Enter', () => {
    const field = render([]);
    field.type('Germany');
    const event = field.keydown('Enter');

    expect(field.emitted).toEqual([['DE']]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('moves the highlight with the arrow keys before picking on Enter', () => {
    const field = render([]);
    field.type('land');
    const second = field.options()[1];
    field.keydown('ArrowDown');
    field.keydown('Enter');

    expect(field.emitted).toEqual([[codeFor(second)]]);
  });

  it('does not offer a country already picked', () => {
    const field = render(['DE']);
    field.type('Germany');

    expect(field.options()).toEqual([]);
  });

  it('removes the value that was asked for and no other', () => {
    const field = render(['DE', 'FR']);
    field.removeButton('France').click();

    expect(field.emitted).toEqual([['DE']]);
  });

  it('stops at the number of values the API accepts', () => {
    const field = render(['DE', 'FR'], { maxValues: 2 });

    expect(field.input().disabled).toBe(true);
    expect(field.element.textContent).toContain('as many values as this filter takes');
  });

  /**
   * `commitDraft` is what a parent form calls before reading this field's
   * values, so a name typed but never confirmed with Enter or a click is not
   * discarded just because the surrounding form was submitted instead.
   */
  it('commitDraft picks the top match, as if Enter had been pressed', () => {
    const fixture = TestBed.createComponent(CountryField);
    (fixture.componentRef as ComponentRef<CountryField>).setInput('label', 'Countries');
    fixture.componentRef.setInput('fieldId', 'countries');
    fixture.componentRef.setInput('values', []);
    const emitted: string[][] = [];
    fixture.componentInstance.valuesChange.subscribe((next) => emitted.push(next));
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'Germany';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    fixture.componentInstance.commitDraft();

    expect(emitted).toEqual([['DE']]);
  });

  it('commitDraft does nothing for text that matches no country', () => {
    const fixture = TestBed.createComponent(CountryField);
    (fixture.componentRef as ComponentRef<CountryField>).setInput('label', 'Countries');
    fixture.componentRef.setInput('fieldId', 'countries');
    fixture.componentRef.setInput('values', []);
    const emitted: string[][] = [];
    fixture.componentInstance.valuesChange.subscribe((next) => emitted.push(next));
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'Not A Real Country';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    fixture.componentInstance.commitDraft();

    expect(emitted).toEqual([]);
  });

  it('commitDraft does nothing when the box is empty', () => {
    const fixture = TestBed.createComponent(CountryField);
    (fixture.componentRef as ComponentRef<CountryField>).setInput('label', 'Countries');
    fixture.componentRef.setInput('fieldId', 'countries');
    fixture.componentRef.setInput('values', []);
    const emitted: string[][] = [];
    fixture.componentInstance.valuesChange.subscribe((next) => emitted.push(next));
    fixture.detectChanges();

    fixture.componentInstance.commitDraft();

    expect(emitted).toEqual([]);
  });
});
