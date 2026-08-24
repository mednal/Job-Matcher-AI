import { Component, input } from '@angular/core';

/**
 * A pending request, announced rather than only drawn.
 *
 * `role="status"` with `aria-live="polite"` means the label reaches a screen
 * reader when the spinner appears; a bare animated `<div>` would leave a
 * non-sighted user with a page that has silently stopped responding. The label is
 * visible text, not `aria-label`, so everyone gets the same sentence.
 */
@Component({
  selector: 'app-spinner',
  template: `
    <span class="ui-spinner__mark" aria-hidden="true"></span>
    <span class="ui-spinner__label">{{ label() }}</span>
  `,
  styleUrl: './spinner.scss',
  host: { class: 'ui-spinner', role: 'status', 'aria-live': 'polite' },
})
export class Spinner {
  readonly label = input('Loading…');
}
