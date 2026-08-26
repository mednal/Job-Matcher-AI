import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { SavedJobsApi } from '../../core/api/saved-jobs-api';
import { ApiError } from '../../core/models/api-error';
import { DEFAULT_PAGE_SIZE } from '../../core/models/pagination';
import { SavedJobsStore } from '../../core/saved-jobs/saved-jobs-store';
import { JobCard } from '../../shared/job-card/job-card';
import { Pagination } from '../../shared/pagination/pagination';
import { SaveToggle } from '../../shared/save-toggle/save-toggle';
import { EmptyState } from '../../shared/ui/empty-state';
import { Spinner } from '../../shared/ui/spinner';

/**
 * The signed-in user's saved jobs: the list, unsaving, and the empty state
 * (M11.8). Reachable only behind `authGuard` (`app.routes.ts`), matching
 * `SavedJobsController` — there is no anonymous version of this page to show.
 *
 * Unlike the search page, paging here is local state rather than the URL:
 * nothing names §8.1's shareable-search requirement for this list, and a saved
 * page number is not a link worth sending anyone.
 *
 * **Unsaving is immediate, not "on next fetch".** `entries` is the page the API
 * returned, filtered live by `SavedJobsStore.ids` — the same store `SaveToggle`
 * writes to — so pressing "Saved" on a row removes it from view the instant the
 * store rolls the id out, with no second request. The list is seeded into the
 * store as soon as it arrives (`seed`) so a row on *this* page is never treated
 * as unsaved by default, regardless of `SavedJobsStore`'s own background-load
 * cap (see its known limitation).
 */
@Component({
  selector: 'app-saved-jobs-page',
  imports: [EmptyState, JobCard, Pagination, SaveToggle, Spinner],
  templateUrl: './saved-jobs-page.html',
  styleUrl: './saved-jobs-page.scss',
})
export class SavedJobsPage {
  private readonly savedJobsApi = inject(SavedJobsApi);
  private readonly store = inject(SavedJobsStore);

  protected readonly page = signal(1);
  protected readonly pageSize = DEFAULT_PAGE_SIZE;

  private readonly resource = rxResource({
    params: () => ({ page: this.page(), pageSize: this.pageSize }),
    stream: ({ params }) => this.savedJobsApi.list(params),
  });

  protected readonly loading = this.resource.isLoading;

  // As on the search and job-detail pages: `value()` throws in the error
  // state, so it is read through `hasValue()` rather than trusting `error()`
  // to stay in step with it.
  private readonly result = computed(() =>
    this.resource.hasValue() ? this.resource.value() : null,
  );

  protected readonly error = computed(() => messageFor(this.resource.error()));
  protected readonly total = computed(() => this.result()?.total ?? 0);

  /**
   * The fetched page, filtered by what the store now knows is still saved.
   * `ids() === null` (nothing loaded yet, on the very first tick) shows
   * everything rather than nothing — the `effect` below seeds the store
   * before a render can observe a false empty state.
   */
  protected readonly entries = computed(() => {
    const items = this.result()?.items ?? [];
    const ids = this.store.ids();
    return ids === null ? items : items.filter((entry) => ids.has(entry.jobId));
  });

  constructor() {
    effect(() => {
      const result = this.result();
      if (result !== null) {
        // `untracked`: `seed` reads the store's own id set to merge into it,
        // and a tracked read of a signal this effect then writes would make
        // the effect re-trigger itself forever. The fetched page is the only
        // thing this effect should react to.
        untracked(() => this.store.seed(result.items.map((entry) => entry.jobId)));
      }
    });
  }

  protected goToPage(page: number): void {
    this.page.set(page);
  }

  protected retry(): void {
    this.resource.reload();
  }
}

function messageFor(error: Error | undefined): string | null {
  if (error === undefined) {
    return null;
  }
  if (error instanceof ApiError) {
    return error.messages[0] ?? 'Your saved jobs could not be loaded.';
  }
  return 'Your saved jobs could not be loaded. Please try again.';
}
