import { Component, computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { JobsApi } from '../../core/api/jobs-api';
import { ApiError } from '../../core/models/api-error';
import { DEFAULT_PAGE_SIZE } from '../../core/models/pagination';
import {
  DEFAULT_SEARCH_SORT,
  SEARCH_SORTS,
  SearchQuery,
  SearchSort,
} from '../../core/models/search';
import { EmptyState } from '../../shared/ui/empty-state';
import { InputField } from '../../shared/ui/input';
import { Spinner } from '../../shared/ui/spinner';
import { JobCard } from '../../shared/job-card/job-card';
import { Pagination } from './pagination/pagination';
import { SearchFilters } from './search-filters/search-filters';
import { activeFilterCount, parseSearchQuery, toQueryParams } from './search-query-params';

/** How each ordering is offered. The wire values themselves are in `core/models`. */
const SORT_LABELS: Record<SearchSort, string> = {
  relevance: 'Best match',
  juniorScore: 'Junior Match',
  postedAt: 'Newest first',
};

/**
 * The search page: query box, filter panel, results, pagination.
 *
 * **The URL holds the search and nothing else does.** The route's query params are
 * parsed into a `SearchQuery`, the request is derived from that, and every control
 * that changes the search navigates rather than mutating local state. That is what
 * `ARCHITECTURE.md` §10 asks for — a search that is shareable and survives reload —
 * and it comes out of the structure rather than out of extra code to save and
 * restore: reloading a filtered URL runs exactly the path a fresh visit runs.
 *
 * The request follows the access token without asking for it. A signed-in user gets
 * profile-fit ranking because `authInterceptor` attaches the token, not because
 * this page sends a flag — §8.1 declares no such parameter, and the backend rejects
 * any it does not declare.
 */
@Component({
  selector: 'app-search-page',
  imports: [EmptyState, InputField, JobCard, Pagination, SearchFilters, Spinner],
  templateUrl: './search-page.html',
  styleUrl: './search-page.scss',
})
export class SearchPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly jobs = inject(JobsApi);

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  protected readonly query = computed(() => parseSearchQuery(this.params()));

  /**
   * One request per distinct query, cancelled and replaced when the URL moves on.
   * `rxResource` is what makes that automatic — a hand-rolled subscription would
   * have to remember to unsubscribe the search the user has already navigated away
   * from, and a late response overwriting a newer one is the classic bug here.
   */
  private readonly results = rxResource({
    params: () => this.query(),
    stream: ({ params }) => this.jobs.search(params),
  });

  protected readonly loading = this.results.isLoading;

  // `results.value()` *throws* while the resource is in its error state, so the
  // page reads it through `hasValue()` rather than guarding on `error()` and
  // trusting the two to stay in step.
  protected readonly page = computed(() =>
    this.results.hasValue() ? (this.results.value() ?? null) : null,
  );

  protected readonly error = computed(() => messageFor(this.results.error()));

  protected readonly sorts = SEARCH_SORTS;
  protected readonly sortLabel = (sort: SearchSort): string => SORT_LABELS[sort];
  protected readonly sort = computed(() => this.query().sort ?? DEFAULT_SEARCH_SORT);

  protected readonly pageNumber = computed(() => this.page()?.page ?? this.query().page ?? 1);
  protected readonly pageSize = computed(() => this.page()?.pageSize ?? DEFAULT_PAGE_SIZE);

  protected readonly hasFilters = computed(() => activeFilterCount(this.query()) > 0);
  protected readonly hasQueryText = computed(() => this.query().q !== undefined);

  /**
   * A new filter set starts at page one. Staying on page seven of the previous
   * search would answer with an empty page far more often than with the results the
   * user just asked for.
   */
  protected applyFilters(filters: SearchQuery): void {
    void this.navigate({ ...filters, sort: this.query().sort });
  }

  protected changeSort(event: Event): void {
    const chosen = SEARCH_SORTS.find(
      (candidate) => candidate === (event.target as HTMLSelectElement).value,
    );

    // Re-ordering starts at page one: page seven of "best match" is a different
    // set of jobs from page seven of "newest first", so keeping the offset would
    // land the user somewhere they did not ask to be.
    if (chosen !== undefined) {
      void this.navigate({ ...this.query(), page: undefined, sort: chosen });
    }
  }

  /**
   * Paging keeps the URL's query rather than the panel's draft, so pressing Next
   * cannot quietly apply filters the user typed but never submitted.
   */
  protected goToPage(page: number): void {
    void this.navigate({ ...this.query(), page });
  }

  protected retry(): void {
    this.results.reload();
  }

  private navigate(query: SearchQuery): Promise<boolean> {
    // The whole parameter set is replaced, not merged: a filter the user removed
    // has to leave the address bar, and `queryParamsHandling: 'merge'` would keep
    // it there.
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams: toQueryParams(query),
    });
  }
}

/**
 * What went wrong, in the server's own words where it has any. A failed search is
 * shown with a way back — the retry re-runs the same request rather than sending
 * the user to rebuild their filters.
 */
function messageFor(error: Error | undefined): string | null {
  if (error === undefined) {
    return null;
  }
  if (error instanceof ApiError) {
    return error.messages[0] ?? 'The search could not be completed.';
  }
  return 'The search could not be completed. Please try again.';
}
