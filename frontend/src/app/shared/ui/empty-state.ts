import { Component, input } from '@angular/core';

/**
 * What a list shows when it has nothing in it: a heading saying so, an optional
 * explanation, and room for the action that fixes it.
 *
 * A blank area is indistinguishable from a page that failed to load, which is why
 * "no results" gets a component rather than an `@empty` block with a `<p>` in it.
 * The heading level is `h2`, not `h1` — every page that uses this already has its
 * own title, and two `h1`s would leave the document outline lying.
 */
@Component({
  selector: 'app-empty-state',
  template: `
    <h2 class="ui-empty-state__title">{{ title() }}</h2>
    <div class="ui-empty-state__body"><ng-content /></div>
  `,
  styleUrl: './empty-state.scss',
  host: { class: 'ui-empty-state' },
})
export class EmptyState {
  readonly title = input.required<string>();
}
