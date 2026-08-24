import { Component, booleanAttribute, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

/**
 * The application's button, as an attribute on a real `<button>`.
 *
 * An attribute selector rather than a wrapper component (`<app-button>`), because a
 * wrapper would have to re-expose everything the native element already does —
 * `type`, `disabled`, `form`, `(click)`, focus order, the Enter/Space handling a
 * screen reader relies on — and every one of those is a chance to get it subtly
 * wrong. Here the caller writes an ordinary button and this only dresses it.
 */
@Component({
  selector: 'button[appButton]',
  template: '<ng-content />',
  styleUrl: './button.scss',
  host: {
    class: 'ui-button',
    '[class.ui-button--primary]': "variant() === 'primary'",
    '[class.ui-button--secondary]': "variant() === 'secondary'",
    '[class.ui-button--ghost]': "variant() === 'ghost'",
    '[class.ui-button--block]': 'block()',
  },
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');

  /** Fills the width of its container — a form's submit, a card's only action. */
  readonly block = input(false, { transform: booleanAttribute });
}
