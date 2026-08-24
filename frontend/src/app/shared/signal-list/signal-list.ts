import { Component, computed, input } from '@angular/core';
import { ClassificationSignal } from '../../core/models/job';
import { signalLabel } from './signal-labels';
import { signalsWithEvidence } from './signal-evidence';

/** One rendered row: the wording, and the posting's own words underneath. */
interface SignalRow {
  readonly code: string;
  readonly label: string;
  readonly evidence: string;
}

/**
 * The evidence behind a classification: positive signals and potential concerns,
 * each quoting the posting.
 *
 * The two headings are `PRODUCT.md` §7's wording. "Potential concerns" rather than
 * "negative signals" is deliberate — the negatives are reasons a junior might not
 * be who the posting is for, not faults in the job, and they are frequently the
 * more useful half.
 */
@Component({
  selector: 'app-signal-list',
  templateUrl: './signal-list.html',
  styleUrl: './signal-list.scss',
  host: { class: 'signal-list' },
})
export class SignalList {
  readonly positive = input<readonly ClassificationSignal[]>([]);
  readonly negative = input<readonly ClassificationSignal[]>([]);

  /** Caps each column on a dense list; the detail page passes nothing and gets all. */
  readonly limit = input<number | null>(null);

  protected readonly positiveRows = computed(() => this.rows(this.positive()));
  protected readonly negativeRows = computed(() => this.rows(this.negative()));

  protected readonly isEmpty = computed(
    () => this.positiveRows().length === 0 && this.negativeRows().length === 0,
  );

  private rows(signals: readonly ClassificationSignal[]): SignalRow[] {
    const visible = signalsWithEvidence(signals);
    const limit = this.limit();
    const kept = limit === null ? visible : visible.slice(0, Math.max(limit, 0));

    return kept.map((signal) => ({
      code: signal.code,
      label: signalLabel(signal.code),
      evidence: signal.evidence.trim(),
    }));
  }
}
