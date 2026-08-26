import { ComponentRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MultiValueField } from './multi-value-field';

function render(values: string[] = [], inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(MultiValueField);
  const componentRef = fixture.componentRef as ComponentRef<MultiValueField>;
  componentRef.setInput('label', 'Technologies');
  componentRef.setInput('fieldId', 'technologies');
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
    type(value: string) {
      input().value = value;
      input().dispatchEvent(new Event('input'));
      fixture.detectChanges();
    },
    add() {
      Array.from(element.querySelectorAll('button'))
        .find((node) => node.textContent?.trim() === 'Add')!
        .click();
      fixture.detectChanges();
    },
    pressEnter() {
      const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
      input().dispatchEvent(event);
      fixture.detectChanges();
      return event;
    },
    removeButton: (value: string) =>
      element.querySelector<HTMLButtonElement>(`[aria-label="Remove ${value} from Technologies"]`)!,
  };
}

describe('MultiValueField', () => {
  it('shows each value as its own chip, so one can be removed on its own', () => {
    expect(render(['java', 'kotlin']).chips()).toEqual(['java', 'kotlin']);
  });

  it('adds what was typed and clears the box', () => {
    const field = render([]);
    field.type('java');
    field.add();

    expect(field.emitted).toEqual([['java']]);
    expect(field.input().value).toBe('');
  });

  it('normalizes a value before it becomes a filter', () => {
    const field = render([], { normalize: (value: string) => value.toLowerCase() });
    field.type('Spring-Boot');
    field.add();

    expect(field.emitted).toEqual([['spring-boot']]);
  });

  it('keeps a value that contains a comma whole', () => {
    const field = render([]);
    field.type('Berlin, Germany');
    field.add();

    expect(field.emitted).toEqual([['Berlin, Germany']]);
  });

  it('adds nothing for an empty box', () => {
    const field = render([]);
    field.type('   ');
    field.add();

    expect(field.emitted).toEqual([]);
  });

  it('clears the box on a duplicate rather than filtering for it twice', () => {
    const field = render(['java']);
    field.type('java');
    field.add();

    expect(field.emitted).toEqual([]);
    expect(field.input().value).toBe('');
  });

  it('removes the value that was asked for and no other', () => {
    const field = render(['java', 'kotlin']);
    field.removeButton('kotlin').click();

    expect(field.emitted).toEqual([['java']]);
  });

  /**
   * Without the `preventDefault` the panel around this field would submit with the
   * typed value still sitting in the box, and the filter the user just entered
   * would never reach the query.
   */
  it('adds on Enter instead of submitting the form around it', () => {
    const field = render([]);
    field.type('java');
    const event = field.pressEnter();

    expect(field.emitted).toEqual([['java']]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('stops at the number of values the API accepts', () => {
    const full = Array.from({ length: 20 }, (_, index) => `tech-${index}`);
    const field = render(full);

    expect(field.input().disabled).toBe(true);
    expect(field.element.textContent).toContain('as many values as this filter takes');
  });

  /** The profile form's lists are allowed more than the search filters' twenty. */
  it('takes the cap from the caller rather than assuming the filter panel’s', () => {
    const twenty = Array.from({ length: 20 }, (_, index) => `tech-${index}`);
    const field = render(twenty, { maxValues: 50 });

    expect(field.input().disabled).toBe(false);
  });

  /**
   * `commitDraft` is what a parent form calls before reading this field's values,
   * so a value typed but never confirmed with Enter or Add is not discarded just
   * because the surrounding form was submitted instead.
   */
  it('commitDraft adds whatever is typed, as if Enter had been pressed', () => {
    const fixture = TestBed.createComponent(MultiValueField);
    (fixture.componentRef as ComponentRef<MultiValueField>).setInput('label', 'Technologies');
    fixture.componentRef.setInput('fieldId', 'technologies');
    fixture.componentRef.setInput('values', []);
    const emitted: string[][] = [];
    fixture.componentInstance.valuesChange.subscribe((next) => emitted.push(next));
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'java';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    fixture.componentInstance.commitDraft();

    expect(emitted).toEqual([['java']]);
  });

  it('commitDraft does nothing when the box is empty', () => {
    const fixture = TestBed.createComponent(MultiValueField);
    (fixture.componentRef as ComponentRef<MultiValueField>).setInput('label', 'Technologies');
    fixture.componentRef.setInput('fieldId', 'technologies');
    fixture.componentRef.setInput('values', []);
    const emitted: string[][] = [];
    fixture.componentInstance.valuesChange.subscribe((next) => emitted.push(next));
    fixture.detectChanges();

    fixture.componentInstance.commitDraft();

    expect(emitted).toEqual([]);
  });
});
