import { Component, computed, DestroyRef, inject } from '@angular/core';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { JobsApi } from '../../core/api/jobs-api';
import { ProfilesApi } from '../../core/api/profiles-api';
import { AuthService } from '../../core/auth/auth-service';
import { ApiError } from '../../core/models/api-error';
import { DEFAULT_PAGE_SIZE } from '../../core/models/pagination';
import {
  DEFAULT_SEARCH_SORT,
  SEARCH_SORTS,
  SearchQuery,
  SearchSort,
} from '../../core/models/search';
import { employmentTypeLabel, workplaceTypeLabel } from '../../shared/enum-labels';
import { levelLabel } from '../../shared/junior-score-badge/level-labels';
import { Button } from '../../shared/ui/button';
import { Chip } from '../../shared/ui/chip';
import { EmptyState } from '../../shared/ui/empty-state';
import { InputField } from '../../shared/ui/input';
import { Spinner } from '../../shared/ui/spinner';
import { JobCard } from '../../shared/job-card/job-card';
import { Pagination } from '../../shared/pagination/pagination';
import { SaveToggle } from '../../shared/save-toggle/save-toggle';
import { hasDefaults, searchDefaultsFrom } from './profile-defaults';
import { SearchFilters } from './search-filters/search-filters';
import {
  ActiveFilter,
  activeFilterCount,
  activeFilters,
  FilterLabels,
  parseSearchQuery,
  toQueryParams,
} from './search-query-params';

/**
 * How the enum members are worded on a chip. `search-query-params.ts` takes them
 * as a parameter rather than importing them, so the URL mapping stays free of
 * the component layer; this is the one place that hands them over.
 */
const FILTER_LABELS: FilterLabels = {
  level: levelLabel,
  // The shared helpers take a nullable value, because a card's job may not state
  // one. A chip's value came out of the URL as a member of the vocabulary, so
  // the null branch is unreachable here — the fallback names the member rather
  // than rendering an empty chip if that ever stops being true.
  workplace: (type) => workplaceTypeLabel(type) ?? type,
  employment: (type) => employmentTypeLabel(type) ?? type,
};

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
 *
 * **A bare `/jobs` is where the profile fills the filters in** (M11.9). Arriving
 * with no query params at all, signed in, the page reads the saved profile and
 * replaces the URL with the filters it implies. Seeding the *address bar* rather
 * than hidden state keeps the single-source rule intact: the filters are visible in
 * the panel, removable with "Clear all", and the resulting link means the same
 * thing for whoever it is sent to. Any parameter already in the URL — a shared
 * search, a reload, the navigation "Clear all" itself performs — means the user has
 * said what they want, and nothing is seeded over it.
 */
@Component({
  selector: 'app-search-page',
  imports: [
    Button,
    Chip,
    EmptyState,
    InputField,
    JobCard,
    Pagination,
    SaveToggle,
    SearchFilters,
    Spinner,
  ],
  templateUrl: './search-page.html',
  styleUrl: './search-page.scss',
})
export class SearchPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly jobs = inject(JobsApi);
  private readonly profiles = inject(ProfilesApi);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

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

  /** Every filter the URL carries, as a removable chip (M11.11). */
  protected readonly chips = computed(() => activeFilters(this.query(), FILTER_LABELS));
  protected readonly hasQueryText = computed(() => this.query().q !== undefined);

  constructor() {
    if (this.auth.isAuthenticated() && this.route.snapshot.queryParamMap.keys.length === 0) {
      this.seedFiltersFromProfile();
    }
  }

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

  /**
   * One filter off. The chip already carries the query without it — computed
   * from the URL, not from the panel's draft — so this only has to navigate,
   * and an unsubmitted edit in the panel cannot be applied by removing a chip.
   */
  protected removeFilter(chip: ActiveFilter): void {
    void this.navigate(chip.without);
  }

  /**
   * Every filter off, the search text kept. Clearing filters is not the same as
   * abandoning the search — the panel's own "Clear all" empties both, because
   * there it sits beneath the whole form.
   */
  protected clearFilters(): void {
    void this.navigate({ q: this.query().q, sort: this.query().sort });
  }

  protected retry(): void {
    this.results.reload();
  }

  /**
   * Read once, from the snapshot, and only for a URL that carries nothing at all.
   * The decision belongs to this visit rather than to every navigation: a later
   * bare `/jobs` produced by "Clear all" is the user removing the filters, and
   * putting them straight back would make the button do nothing.
   *
   * The blank search still runs while the profile is being read. Holding the
   * results back would make an anonymous visitor — the common case — wait on a
   * request that is not going to happen, and the seeded navigation replaces the
   * in-flight search the same way any filter change does.
   */
  private seedFiltersFromProfile(): void {
    // `takeUntilDestroyed`: a slow profile must not navigate a page the user has
    // already left.
    this.profiles
      .mine()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          const defaults = searchDefaultsFrom(profile);
          if (hasDefaults(defaults)) {
            // `replaceUrl`: the bare URL was never a search the user chose, so
            // Back should leave the page rather than return to it and seed again.
            void this.router.navigate([], {
              relativeTo: this.route,
              queryParams: toQueryParams(defaults),
              replaceUrl: true,
            });
          }
        },
        // No profile, no defaults. The unfiltered search is already on screen,
        // and it is a complete answer on its own.
        error: () => {},
      });
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
