import { Component, input, output } from '@angular/core';

export type ChipTone = 'neutral' | 'brand' | 'positive' | 'caution' | 'negative';

/**
 * A small labelled token: a technology, a workplace type, a filter that is on.
 *
 * Presentational by default. M11.11 adds the one interaction it needs — an
 * optional remove button — for the active-filter chips on the search page.
 * `removable` is opt-in rather than inferred from whether anyone listens to
 * `remove`, so a chip that merely labels something (a technology on a card)
 * cannot grow a control by accident.
 *
 * The chip itself is never a button. A filter chip's *label* is not clickable —
 * only the × is — because clicking the word "Remote" to remove the Remote filter
 * is a guess about intent, and there is no undo beside it.
 */
@Component({
  selector: 'app-chip',
  template: `<ng-content />
    @if (removable()) {
      <button
        class="ui-chip__remove"
        type="button"
        [attr.aria-label]="removeLabel()"
        (click)="remove.emit()"
      >
        <span aria-hidden="true">&times;</span>
      </button>
    }`,
  styleUrl: './chip.scss',
  host: {
    class: 'ui-chip',
    '[class.ui-chip--brand]': "tone() === 'brand'",
    '[class.ui-chip--positive]': "tone() === 'positive'",
    '[class.ui-chip--caution]': "tone() === 'caution'",
    '[class.ui-chip--negative]': "tone() === 'negative'",
    '[class.ui-chip--removable]': 'removable()',
  },
})
export class Chip {
  readonly tone = input<ChipTone>('neutral');
  readonly removable = input(false);
  /**
   * What the button announces. The projected content is arbitrary markup that
   * this component cannot read, so the accessible name has to be given rather
   * than derived — a bare "Remove" on six chips tells a screen reader nothing.
   */
  readonly removeLabel = input('Remove');
  readonly remove = output<void>();
}
