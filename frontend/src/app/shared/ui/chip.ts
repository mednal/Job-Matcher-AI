import { Component, input } from '@angular/core';

export type ChipTone = 'neutral' | 'brand' | 'positive' | 'caution' | 'negative';

/**
 * A small labelled token: a technology, a workplace type, a filter that is on.
 *
 * Presentational only — no remove button and no click output. The filter chips of
 * M11.6 will need those, and adding them now would be guessing at an interaction
 * nothing calls for yet.
 */
@Component({
  selector: 'app-chip',
  template: '<ng-content />',
  styleUrl: './chip.scss',
  host: {
    class: 'ui-chip',
    '[class.ui-chip--brand]': "tone() === 'brand'",
    '[class.ui-chip--positive]': "tone() === 'positive'",
    '[class.ui-chip--caution]': "tone() === 'caution'",
    '[class.ui-chip--negative]': "tone() === 'negative'",
  },
})
export class Chip {
  readonly tone = input<ChipTone>('neutral');
}
