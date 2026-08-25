import { Component, computed, effect, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { JobsApi } from '../../core/api/jobs-api';
import { ApiError } from '../../core/models/api-error';
import { employmentTypeLabel, workplaceTypeLabel } from '../../shared/enum-labels';
import { formatExperience } from '../../shared/job-card/experience-label';
import { postedLabel } from '../../shared/job-card/posted-label';
import { JuniorScoreBadge } from '../../shared/junior-score-badge/junior-score-badge';
import { SaveToggle } from '../../shared/save-toggle/save-toggle';
import { SignalList } from '../../shared/signal-list/signal-list';
import { hasVisibleEvidence } from '../../shared/signal-list/signal-evidence';
import { Chip } from '../../shared/ui/chip';
import { EmptyState } from '../../shared/ui/empty-state';
import { Spinner } from '../../shared/ui/spinner';
import { descriptionParagraphs } from './description-paragraphs';
import { languageLabel } from './language-label';

/**
 * One job in full: the description, what the posting asks for, the evidence behind
 * its Junior Match, and a link out to every source carrying it.
 *
 * **This is the page the score is allowed to be a number on.** `ARCHITECTURE.md`
 * §6.5 lets the figure appear only beside the evidence that produced it, and here
 * the evidence is present — `GET /jobs/:id` returns the signals that `JobSummary`
 * does not, which is exactly why a search card shows the band and this shows both.
 * The assertion is still derived rather than declared: `evidenceShown` is computed
 * from the signals that will actually render, so an unclassified job, or one whose
 * signals arrived without excerpts, falls back to the band on its own.
 *
 * **There is no salary anywhere on this page**, and that is D7 rather than an
 * oversight — the column does not exist in the schema and the API returns no such
 * field.
 *
 * The route is public, like the API behind it: a job opened from a shared link is
 * readable without an account. `SaveToggle` hides its own control for a
 * signed-out visitor, so this page does not gate it separately.
 */
@Component({
  selector: 'app-job-detail-page',
  imports: [Chip, EmptyState, JuniorScoreBadge, RouterLink, SaveToggle, SignalList, Spinner],
  templateUrl: './job-detail-page.html',
  styleUrl: './job-detail-page.scss',
})
export class JobDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly jobs = inject(JobsApi);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  protected readonly jobId = computed(() => this.params().get('id') ?? '');

  /**
   * One request per id, cancelled and replaced when the route moves on — the same
   * reasoning as the search page. `undefined` params leave the resource idle, so an
   * address with no id never sends a request to `/jobs/`.
   */
  private readonly resource = rxResource({
    params: () => this.jobId() || undefined,
    stream: ({ params: id }) => this.jobs.detail(id),
  });

  protected readonly loading = this.resource.isLoading;

  // As on the search page: `value()` throws in the error state, so it is read
  // through `hasValue()` rather than by guarding on `error()` separately.
  protected readonly job = computed(() =>
    this.resource.hasValue() ? (this.resource.value() ?? null) : null,
  );

  private readonly failure = computed(() => this.resource.error());

  /** A 404 is a different page from a failure, not a redder version of one. */
  protected readonly notFound = computed(() => {
    const error = this.failure();
    return error instanceof ApiError && error.isNotFound;
  });

  protected readonly errorMessage = computed(() => {
    const error = this.failure();
    if (error === undefined || this.notFound()) {
      return null;
    }
    return error instanceof ApiError
      ? (error.messages[0] ?? 'This job could not be loaded.')
      : 'This job could not be loaded. Please try again.';
  });

  protected readonly classification = computed(() => this.job()?.classification ?? null);
  protected readonly positiveSignals = computed(() => this.classification()?.positiveSignals ?? []);
  protected readonly negativeSignals = computed(() => this.classification()?.negativeSignals ?? []);

  /** The signals are rendered on this page, so the badge may show the number. */
  protected readonly evidenceShown = computed(() =>
    hasVisibleEvidence(this.positiveSignals(), this.negativeSignals()),
  );

  protected readonly location = computed(() => {
    const job = this.job();
    return job?.location ?? job?.countryCode ?? 'Location not stated';
  });

  protected readonly workplace = computed(() => workplaceTypeLabel(this.job()?.workplaceType));
  protected readonly employment = computed(() => employmentTypeLabel(this.job()?.employmentType));
  protected readonly language = computed(() => languageLabel(this.job()?.language));

  protected readonly experience = computed(() =>
    formatExperience(this.job()?.requiredMinYears, this.job()?.requiredMaxYears),
  );

  /** "Posted" only when the source stated a date — `job-card`'s rule, unchanged. */
  protected readonly posted = computed(() => {
    const job = this.job();
    if (job === null) {
      return null;
    }
    const stated = job.postedAt !== null;
    const label = postedLabel(stated ? (job.postedAt as string) : job.effectivePostedAt);
    return label === null ? null : { prefix: stated ? 'Posted' : 'First seen', label };
  });

  protected readonly paragraphs = computed(() => descriptionParagraphs(this.job()?.description));

  /**
   * The heading over the outbound links. A job carried by several sources is worth
   * saying out loud — it is one posting, not several jobs, and the reader may
   * prefer to apply through one of them.
   */
  protected readonly sourcesHeading = computed(() => {
    const count = this.job()?.sources.length ?? 0;
    return count > 1 ? `Also listed on ${count} sources` : 'Original posting';
  });

  constructor() {
    /**
     * A merged-away id still resolves (M7.4): the backend serves the surviving job
     * and names the id that was asked for. The address bar is corrected to the id
     * that was served, so what the reader copies out of it is the link that will
     * keep working. `replaceUrl` keeps the stale id out of the history — going back
     * to it would only redirect forward again — and the `id` comparison is what
     * makes this run once rather than in a loop.
     */
    effect(() => {
      const job = this.job();
      if (job !== null && job.redirectedFromJobId !== null && job.id !== this.jobId()) {
        void this.router.navigate(['/jobs', job.id], { replaceUrl: true });
      }
    });
  }

  protected retry(): void {
    this.resource.reload();
  }
}
