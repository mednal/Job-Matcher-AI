import { Component, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { Button } from './button';
import { Chip } from './chip';
import { EmptyState } from './empty-state';
import { InputField } from './input';
import { Spinner } from './spinner';

/**
 * The primitives are attributes on native elements rather than wrappers, and the
 * cost of that choice is that it has to be shown not to break the elements it sits
 * on. That is what this file checks — not appearance, which is CSS.
 */
@Component({
  imports: [ReactiveFormsModule, Button, Chip, EmptyState, InputField, Spinner],
  template: `
    <button appButton type="submit" [disabled]="disabled()">Save</button>
    <button appButton variant="ghost" block>Cancel</button>

    <input appInput id="email" [formControl]="email" />
    <select appInput id="level">
      <option value="entry">Entry level</option>
      <option value="senior">Senior</option>
    </select>

    <app-chip tone="positive">Remote</app-chip>
    <app-empty-state title="No saved jobs yet">Save a job to see it here.</app-empty-state>
    <app-spinner label="Searching…" />
  `,
})
class Host {
  // A signal rather than a plain field: the application is zoneless, so a bare
  // property assignment in a test is not a change anything is notified of.
  readonly disabled = signal(false);
  readonly email = new FormControl('');
}

function render() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('ui primitives', () => {
  describe('Button', () => {
    it('stays a real button, keeping its type and its disabled state', () => {
      const { fixture, element } = render();
      const submit = element.querySelector<HTMLButtonElement>('button')!;

      expect(submit.type).toBe('submit');
      expect(submit.disabled).toBe(false);

      fixture.componentInstance.disabled.set(true);
      fixture.detectChanges();
      expect(submit.disabled).toBe(true);
    });

    it('renders its projected label', () => {
      expect(render().element.querySelector('button')!.textContent?.trim()).toBe('Save');
    });

    it('carries the classes for the variant it was given', () => {
      const buttons = render().element.querySelectorAll('button');

      expect(buttons[0].classList).toContain('ui-button--primary');
      expect(buttons[1].classList).toContain('ui-button--ghost');
      expect(buttons[1].classList).toContain('ui-button--block');
    });
  });

  describe('InputField', () => {
    // The reason the primitive is an attribute and not a wrapper: a wrapper would
    // have to reimplement `ControlValueAccessor`, and this is what would break.
    it('leaves the reactive form control bound to the real element', () => {
      const { fixture, element } = render();
      const input = element.querySelector<HTMLInputElement>('#email')!;

      input.value = 'someone@example.com';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(fixture.componentInstance.email.value).toBe('someone@example.com');
    });

    // A component drops content it does not project, which on a `<select>` would
    // mean losing every option. `<ng-content />` in the template is what stops it.
    it('keeps the options of a select it is applied to', () => {
      const options = render().element.querySelectorAll('#level option');

      expect(Array.from(options, (option) => option.textContent)).toEqual([
        'Entry level',
        'Senior',
      ]);
    });
  });

  it('renders a chip with its tone and its label', () => {
    const chip = render().element.querySelector('app-chip')!;

    expect(chip.textContent?.trim()).toBe('Remote');
    expect(chip.classList).toContain('ui-chip--positive');
  });

  it('renders an empty state as a heading plus the explanation given to it', () => {
    const empty = render().element.querySelector('app-empty-state')!;

    expect(empty.querySelector('h2')?.textContent?.trim()).toBe('No saved jobs yet');
    expect(empty.textContent).toContain('Save a job to see it here.');
  });

  it('announces a spinner rather than only drawing one', () => {
    const spinner = render().element.querySelector('app-spinner')!;

    expect(spinner.getAttribute('role')).toBe('status');
    expect(spinner.getAttribute('aria-live')).toBe('polite');
    expect(spinner.textContent).toContain('Searching…');
  });
});
