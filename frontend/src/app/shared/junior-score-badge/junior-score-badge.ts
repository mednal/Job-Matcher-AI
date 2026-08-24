import { Component, booleanAttribute, computed, input } from '@angular/core';
import { JuniorLevel } from '../../core/models/enums';
import { levelLabel } from './level-labels';

/**
 * The junior suitability score, always under the label **"Junior Match"**.
 *
 * Two product rules from `ARCHITECTURE.md` §6.5 are built into this component
 * rather than left to the pages that use it:
 *
 * 1. **The number never appears without its evidence.** `evidenceShown` is the
 *    caller stating that a `signal-list` is rendered next to this badge; without
 *    it the badge falls back to the `JuniorLevel` band, which §6.5 names as the
 *    thing to show when the evidence cannot be. A page cannot show a bare
 *    percentage by forgetting something — it has to assert the opposite of the
 *    truth to get one. That matters because a percentage on its own reads as a
 *    chance of being hired, and this score is not that.
 * 2. **The label is fixed.** It is not an input, so no caller can retitle the
 *    number into a prediction.
 *
 * The band is shown in both modes, so the number is never the only thing read.
 */
@Component({
  selector: 'app-junior-score-badge',
  templateUrl: './junior-score-badge.html',
  styleUrl: './junior-score-badge.scss',
  host: {
    class: 'score-badge',
    '[class.score-badge--entry]': "level() === 'ENTRY_LEVEL'",
    '[class.score-badge--likely]': "level() === 'LIKELY_ENTRY_LEVEL'",
    '[class.score-badge--unclear]': "level() === 'AMBIGUOUS'",
    '[class.score-badge--experienced]':
      "level() === 'EXPERIENCED' || level() === 'CLEARLY_EXPERIENCED'",
    '[attr.aria-label]': 'ariaLabel()',
  },
})
export class JuniorScoreBadge {
  readonly level = input<JuniorLevel | null>(null);

  /** 0-100 suitability for a junior candidate. Never a probability of anything. */
  readonly score = input<number | null>(null);

  /**
   * True only when the caller is also rendering this score's signals. It is the
   * page's assertion, so the badge does not have to be handed the signals it
   * would otherwise only count.
   */
  readonly evidenceShown = input(false, { transform: booleanAttribute });

  protected readonly band = computed(() => levelLabel(this.level()));

  /**
   * The number, or `null` when it may not be shown.
   *
   * A level is required as well as the evidence: the band is the number's
   * context, and "94%" over "Not yet assessed" would be a bare percentage in all
   * but name. In practice the two arrive together — the backend denormalizes
   * `juniorLevel` and `juniorScore` onto the job in one write — so this only
   * decides what an inconsistent row looks like, and it looks like an unassessed
   * one rather than a naked figure.
   */
  protected readonly shownScore = computed(() => {
    const score = this.score();
    return this.evidenceShown() && score !== null && this.level() !== null ? score : null;
  });

  /**
   * The badge reads as three separate fragments otherwise. "out of 100" rather
   * than the visible "%", because a percent sign read aloud invites exactly the
   * probability reading the wording elsewhere is careful to avoid.
   */
  protected readonly ariaLabel = computed(() => {
    const score = this.shownScore();
    return score === null
      ? `Junior Match: ${this.band()}`
      : `Junior Match: ${score} out of 100, ${this.band()}`;
  });
}
