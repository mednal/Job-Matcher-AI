import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClassificationSignal, JobSummary } from '../../core/models/job';
import { employmentTypeLabel, workplaceTypeLabel } from '../enum-labels';
import { JuniorScoreBadge } from '../junior-score-badge/junior-score-badge';
import { SignalList } from '../signal-list/signal-list';
import { hasVisibleEvidence } from '../signal-list/signal-evidence';
import { Chip } from '../ui/chip';
import { formatExperience } from './experience-label';
import { postedLabel } from './posted-label';

/** Beyond this the chip row wraps into a block of its own and stops being scannable. */
const MAX_TECHNOLOGIES = 6;

/**
 * One job in a list — the search results, the saved-jobs page.
 *
 * It composes `junior-score-badge` with `signal-list`, which `ARCHITECTURE.md` §10
 * requires to appear together. The composition is what enforces it: the card works
 * out whether any evidence will actually be rendered and hands that same answer to
 * the badge, so a card with no signals shows the `JuniorLevel` band and a card with
 * signals shows the number above the excerpts that produced it. No caller is
 * trusted to keep the two in step.
 *
 * **The signals arrive as inputs, not as fields read off the job.** M9.6 grew them
 * onto `JobSummary`, so a search result now carries its own evidence and shows the
 * number — but the caller still passes them in, which is what lets the detail page
 * hand over the *complete* set while a list hands over the capped one. A caller
 * that passes nothing gets the `JuniorLevel` band, which §6.5 names as the correct
 * fallback when the evidence cannot be shown beside the number.
 *
 * Purely presentational: it takes a job and renders it. Saving is M11.8, and it
 * arrives through the `card-actions` slot rather than by this component learning
 * about the saved-jobs API.
 */
@Component({
  selector: 'app-job-card',
  imports: [RouterLink, Chip, JuniorScoreBadge, SignalList],
  templateUrl: './job-card.html',
  styleUrl: './job-card.scss',
  host: { class: 'job-card' },
})
export class JobCard {
  readonly job = input.required<JobSummary>();
  readonly positiveSignals = input<readonly ClassificationSignal[]>([]);
  readonly negativeSignals = input<readonly ClassificationSignal[]>([]);

  /** The score's evidence is on the page, so the badge may show the number. */
  protected readonly evidenceShown = computed(() =>
    hasVisibleEvidence(this.positiveSignals(), this.negativeSignals()),
  );

  protected readonly location = computed(() => {
    const job = this.job();
    return job.location ?? job.countryCode ?? 'Location not stated';
  });

  protected readonly workplace = computed(() => workplaceTypeLabel(this.job().workplaceType));
  protected readonly employment = computed(() => employmentTypeLabel(this.job().employmentType));

  protected readonly experience = computed(() =>
    formatExperience(this.job().requiredMinYears, this.job().requiredMaxYears),
  );

  /**
   * M11.10 — the sentence this whole product exists to put in front of someone:
   * the title says junior, the posting says otherwise.
   *
   * `juniorTitleContradicted` is the API's, decided with the same title
   * vocabulary and the same threshold the classifier used, so this component
   * only phrases it. The years come from the posting's own stated minimum, so
   * the line quotes a figure rather than characterising one.
   */
  protected readonly contradiction = computed(() => {
    const job = this.job();
    if (!job.juniorTitleContradicted || job.requiredMinYears === null) {
      return null;
    }
    return `Reads as junior — but asks for ${job.requiredMinYears}+ years`;
  });

  /**
   * "Posted" only when the source stated a date. Otherwise the date shown is
   * `effectivePostedAt`, which falls back to when this system first saw the
   * posting — a different fact, and labelling it "Posted" would be inventing one.
   */
  protected readonly posted = computed(() => {
    const job = this.job();
    const stated = job.postedAt !== null;
    const label = postedLabel(stated ? (job.postedAt as string) : job.effectivePostedAt);
    return label === null ? null : { prefix: stated ? 'Posted' : 'First seen', label };
  });

  protected readonly technologies = computed(() =>
    this.job().technologies.slice(0, MAX_TECHNOLOGIES),
  );

  protected readonly hiddenTechnologyCount = computed(() =>
    Math.max(this.job().technologies.length - MAX_TECHNOLOGIES, 0),
  );
}
