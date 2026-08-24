import { ClassificationSignal } from '../../core/models/job';

/**
 * The signals that carry a verbatim excerpt, which are the only ones the UI shows.
 *
 * `ARCHITECTURE.md` §5.3 requires every signal to be produced with its evidence, so
 * in practice nothing is filtered out here. It is a floor rather than a workaround:
 * a signal with no excerpt is an assertion about a job that the user cannot check,
 * and the whole point of showing signals is that the classification can be argued
 * with. If the backend ever emits one, it is dropped rather than displayed bare.
 *
 * This is also what a page calls to decide whether it may pass `evidenceShown` to
 * `junior-score-badge` — the two answers come from one function, so the badge cannot
 * show a number next to an empty list.
 */
export function signalsWithEvidence(
  signals: readonly ClassificationSignal[] | null | undefined,
): ClassificationSignal[] {
  return (signals ?? []).filter((signal) => signal.evidence.trim().length > 0);
}

/** True when at least one signal on either side can be shown with its excerpt. */
export function hasVisibleEvidence(
  positive: readonly ClassificationSignal[] | null | undefined,
  negative: readonly ClassificationSignal[] | null | undefined,
): boolean {
  return signalsWithEvidence(positive).length > 0 || signalsWithEvidence(negative).length > 0;
}
