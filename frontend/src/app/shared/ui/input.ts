import { Component } from '@angular/core';

/**
 * Field styling for the native form controls, applied as an attribute.
 *
 * Same reasoning as `Button`, and it matters more here: a wrapper component around
 * an `<input>` would have to implement `ControlValueAccessor` to work with the
 * reactive forms the auth screens already use, and a hand-written accessor is a
 * well-known source of bugs (touched/dirty state, `setDisabledState`, writing back
 * a value the user is mid-way through typing). `formControlName` stays on the real
 * element and Angular's own accessors keep doing their job.
 *
 * `<ng-content />` is not decoration: without it a component on a `<select>` would
 * drop the `<option>` children, since content a component does not project is not
 * rendered. On an `<input>` there is nothing to project and it costs nothing.
 */
@Component({
  selector: 'input[appInput], textarea[appInput], select[appInput]',
  template: '<ng-content />',
  styleUrl: './input.scss',
  host: { class: 'ui-input' },
})
export class InputField {}
