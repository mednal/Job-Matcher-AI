import { Component, computed, effect, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
  EMPLOYMENT_TYPES,
  EmploymentType,
  JUNIOR_LEVELS,
  JuniorLevel,
  WORKPLACE_TYPES,
  WorkplaceType,
} from '../../../core/models/enums';
import {
  MAX_LOCATION_LENGTH,
  MAX_POSTED_WITHIN_DAYS,
  MAX_SEARCH_QUERY_LENGTH,
  MAX_TECHNOLOGY_LENGTH,
  MAX_YEARS_REQUIRED,
  SearchQuery,
} from '../../../core/models/search';
import { employmentTypeLabel, workplaceTypeLabel } from '../../../shared/enum-labels';
import { levelLabel } from '../../../shared/junior-score-badge/level-labels';
import { MultiValueField } from '../../../shared/multi-value-field/multi-value-field';
import { Button } from '../../../shared/ui/button';
import { InputField } from '../../../shared/ui/input';
import { activeFilterCount } from '../search-query-params';

/** The date filter's choices. Free-form days are legal on the wire, not useful here. */
const POSTED_WITHIN_CHOICES: readonly { days: number; label: string }[] = [
  { days: 1, label: 'Last 24 hours' },
  { days: 7, label: 'Last 7 days' },
  { days: 14, label: 'Last 14 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 3 months' },
];

interface FiltersValue {
  q: string;
  technologies: string[];
  locations: string[];
  countryCode: string[];
  workplaceType: WorkplaceType[];
  employmentType: EmploymentType[];
  juniorLevel: JuniorLevel[];
  minJuniorScore: number | null;
  maxYearsRequired: number | null;
  postedWithinDays: number | null;
}

/**
 * The query box and the filter panel: everything that decides *which* jobs come
 * back. Sorting and pagination are the page's, because they change how one result
 * set is presented rather than what is in it.
 *
 * **The panel is a draft, and the URL is the truth.** `query` flows in from the
 * address bar and resets the form; `apply` carries the edited query back out, and
 * the page answers by navigating. Nothing here calls the API or the router, so this
 * component has no way to disagree with the URL — an edit that is never submitted
 * is discarded by the next navigation, which is also what makes the back button
 * behave.
 *
 * **`sort` is deliberately absent** from the emitted query. The page owns it and
 * merges it back, so applying a filter cannot silently reset an ordering the user
 * chose, and "Clear filters" does not have to decide whether an ordering is a
 * filter.
 */
@Component({
  selector: 'app-search-filters',
  imports: [Button, InputField, MultiValueField, ReactiveFormsModule],
  templateUrl: './search-filters.html',
  styleUrl: './search-filters.scss',
})
export class SearchFilters {
  readonly query = input.required<SearchQuery>();
  /** Loading is the page's business; the panel only stops a second submit. */
  readonly busy = input(false);

  readonly apply = output<SearchQuery>();

  protected readonly workplaceTypes = WORKPLACE_TYPES;
  protected readonly employmentTypes = EMPLOYMENT_TYPES;
  protected readonly juniorLevels = JUNIOR_LEVELS;
  protected readonly postedWithinChoices = POSTED_WITHIN_CHOICES;

  protected readonly maxQueryLength = MAX_SEARCH_QUERY_LENGTH;
  protected readonly maxTechnologyLength = MAX_TECHNOLOGY_LENGTH;
  protected readonly maxLocationLength = MAX_LOCATION_LENGTH;
  protected readonly maxYearsRequired = MAX_YEARS_REQUIRED;
  protected readonly maxPostedWithinDays = MAX_POSTED_WITHIN_DAYS;

  /** Technology slugs are lowercase by definition of the stored vocabulary. */
  protected readonly lowercase = (value: string): string => value.toLowerCase();
  /** Country codes are uppercase alpha-2, as the profile form writes them. */
  protected readonly uppercase = (value: string): string => value.toUpperCase();

  protected readonly workplaceLabel = workplaceTypeLabel;
  protected readonly employmentLabel = employmentTypeLabel;
  protected readonly levelLabel = levelLabel;

  protected readonly form = new FormGroup({
    q: new FormControl('', { nonNullable: true }),
    technologies: new FormControl<string[]>([], { nonNullable: true }),
    locations: new FormControl<string[]>([], { nonNullable: true }),
    countryCode: new FormControl<string[]>([], { nonNullable: true }),
    workplaceType: new FormControl<WorkplaceType[]>([], { nonNullable: true }),
    employmentType: new FormControl<EmploymentType[]>([], { nonNullable: true }),
    juniorLevel: new FormControl<JuniorLevel[]>([], { nonNullable: true }),
    minJuniorScore: new FormControl<number | null>(null),
    maxYearsRequired: new FormControl<number | null>(null),
    postedWithinDays: new FormControl<number | null>(null),
  });

  /** How many filters the *URL* carries — the count beside "Filters". */
  protected readonly activeCount = computed(() => activeFilterCount(this.query()));

  /**
   * Whether the panel is expanded. It starts open when the first URL already
   * carries filters, so a shared link shows what was narrowed instead of hiding it
   * behind a closed summary — and only then, because reopening it on every later
   * navigation would fight a user who had just collapsed it.
   */
  protected readonly panelOpen = signal(false);
  private openDecided = false;

  constructor() {
    effect(() => {
      this.form.setValue(toFormValue(this.query()), { emitEvent: false });

      if (!this.openDecided) {
        this.openDecided = true;
        this.panelOpen.set(activeFilterCount(this.query()) > 0);
      }
    });
  }

  /** `<details>` opens and closes itself; this keeps the signal from going stale. */
  protected onPanelToggle(event: Event): void {
    this.panelOpen.set((event.target as HTMLDetailsElement).open);
  }

  /**
   * Toggling is by identity of the member, not by reading the checkbox's `checked`:
   * the box is bound to the control, so the control is the state and the DOM is a
   * view of it. Reading the event would make the two able to drift.
   */
  protected toggle<T extends string>(control: FormControl<T[]>, member: T): void {
    const current = control.value;
    control.setValue(
      current.includes(member) ? current.filter((kept) => kept !== member) : [...current, member],
    );
  }

  protected isOn<T extends string>(control: FormControl<T[]>, member: T): boolean {
    return control.value.includes(member);
  }

  protected submit(): void {
    if (!this.busy()) {
      this.apply.emit(toQuery(this.form.getRawValue()));
    }
  }

  /**
   * Back to the default result set — which is not "every job": `PRODUCT.md` §8 keeps
   * the two experienced bands out until a filter asks for them, and clearing the
   * filters is what asking stops.
   */
  protected clear(): void {
    this.apply.emit({});
  }
}

function toFormValue(query: SearchQuery): FiltersValue {
  return {
    q: query.q ?? '',
    technologies: [...(query.technologies ?? [])],
    locations: [...(query.locations ?? [])],
    countryCode: [...(query.countryCode ?? [])],
    workplaceType: [...(query.workplaceType ?? [])],
    employmentType: [...(query.employmentType ?? [])],
    juniorLevel: [...(query.juniorLevel ?? [])],
    minJuniorScore: query.minJuniorScore ?? null,
    maxYearsRequired: query.maxYearsRequired ?? null,
    postedWithinDays: query.postedWithinDays ?? null,
  };
}

/**
 * Only what is set. An empty box and an empty list are the absence of a filter, not
 * a filter for nothing — the same rule `toSearchParams` applies before the request
 * and `parseSearchQuery` applies after the URL.
 *
 * Nothing else is validated here. The emitted query goes into the address bar and
 * comes back through `parseSearchQuery`, which is where the API's bounds are
 * enforced, so a second copy of them in this component could only ever disagree.
 */
function toQuery(value: FiltersValue): SearchQuery {
  const query: SearchQuery = {};

  const q = value.q.trim();
  if (q.length > 0) {
    query.q = q;
  }
  if (value.technologies.length > 0) {
    query.technologies = value.technologies;
  }
  if (value.locations.length > 0) {
    query.locations = value.locations;
  }
  if (value.countryCode.length > 0) {
    query.countryCode = value.countryCode;
  }
  if (value.workplaceType.length > 0) {
    query.workplaceType = value.workplaceType;
  }
  if (value.employmentType.length > 0) {
    query.employmentType = value.employmentType;
  }
  if (value.juniorLevel.length > 0) {
    query.juniorLevel = value.juniorLevel;
  }
  if (value.minJuniorScore !== null) {
    query.minJuniorScore = value.minJuniorScore;
  }
  if (value.maxYearsRequired !== null) {
    query.maxYearsRequired = value.maxYearsRequired;
  }
  if (value.postedWithinDays !== null) {
    query.postedWithinDays = value.postedWithinDays;
  }

  return query;
}
