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
 * **The list endpoints do not return signals.** `JobSummary` carries `juniorLevel`
 * and `juniorScore` but no evidence, so a search result shows the band by default;
 * §6.5 names that as the correct fallback when the evidence cannot be shown beside
 * the number. `positiveSignals` / `negativeSignals` are inputs rather than fields
 * read off the job so a caller that *does* have them — the detail page, or a list
 * endpoint that grows them later — gets the number without this component changing.
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
