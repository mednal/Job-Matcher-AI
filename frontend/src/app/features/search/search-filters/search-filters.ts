import { Component, computed, effect, input, output, signal, viewChildren } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  EMPLOYMENT_TYPES,
  EmploymentType,
  JUNIOR_LEVELS,
  JuniorLevel,
  WORKPLACE_TYPES,
  WorkplaceType,
} from '../../../core/models/enums';
import {
  MAX_POSTED_WITHIN_DAYS,
  MAX_SEARCH_QUERY_LENGTH,
  MAX_TECHNOLOGY_LENGTH,
  MAX_YEARS_REQUIRED,
  SearchQuery,
} from '../../../core/models/search';
import { CountryField } from '../../../shared/country-field/country-field';
import { employmentTypeLabel, workplaceTypeLabel } from '../../../shared/enum-labels';
import { fieldError } from '../../../shared/field-errors';
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
  /** A slider, not a box: 0 is its rest position, not a typed "0". */
  minJuniorScore: number;
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
  imports: [Button, CountryField, InputField, MultiValueField, ReactiveFormsModule],
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
  protected readonly maxYearsRequired = MAX_YEARS_REQUIRED;
  protected readonly maxPostedWithinDays = MAX_POSTED_WITHIN_DAYS;

  /** Technology slugs are lowercase by definition of the stored vocabulary. */
  protected readonly lowercase = (value: string): string => value.toLowerCase();

  protected readonly workplaceLabel = workplaceTypeLabel;
  protected readonly employmentLabel = employmentTypeLabel;
  protected readonly levelLabel = levelLabel;

  protected readonly form = new FormGroup({
    q: new FormControl('', { nonNullable: true }),
    technologies: new FormControl<string[]>([], { nonNullable: true }),
    // No control in the template writes to this any more — "Where" was
    // replaced by the country picker below. It exists purely to round-trip
    // whatever `query` already carries, so a location a profile or a shared
    // link set survives a submit of the *other* filters instead of being
    // silently dropped by a form that forgot it owns this key too.
    locations: new FormControl<string[]>([], { nonNullable: true }),
    countryCode: new FormControl<string[]>([], { nonNullable: true }),
    workplaceType: new FormControl<WorkplaceType[]>([], { nonNullable: true }),
    employmentType: new FormControl<EmploymentType[]>([], { nonNullable: true }),
    juniorLevel: new FormControl<JuniorLevel[]>([], { nonNullable: true }),
    // A range input, unlike the number boxes below, cannot be driven outside its
    // `min`/`max` attributes from the UI, so there is no matching pair of
    // `Validators` to mirror `parseSearchQuery`'s bounds with here.
    minJuniorScore: new FormControl(0, { nonNullable: true }),
    // Mirrored from the bounds `parseSearchQuery` enforces on the way back out of
    // the URL: without them, a value outside range submits clean and then
    // vanishes silently the next time the query round-trips through the address
    // bar, with nothing on screen to say why the filter it named is gone.
    maxYearsRequired: new FormControl<number | null>(null, [
      Validators.min(0),
      Validators.max(MAX_YEARS_REQUIRED),
    ]),
    postedWithinDays: new FormControl<number | null>(null),
  });

  /** Every multi-value field the panel renders, so `submit` can flush their drafts. */
  private readonly multiValueFields = viewChildren(MultiValueField);
  /** The country field flushes the same way, but is not a `MultiValueField`. */
  private readonly countryFields = viewChildren(CountryField);

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

  /**
   * The score/years/posted trio, folded under its own disclosure — a fourth
   * checkbox-style group beside "Experience level" and "Workplace" read as one
   * more thing to scan even for someone who wants none of them. Same
   * decide-once-from-the-URL rule as the panel itself: closed by default, but
   * open from the first render when a shared link already narrows by one of the
   * three, so nothing the URL carries is left hidden behind a summary.
   */
  protected readonly moreFiltersOpen = signal(false);
  private moreFiltersOpenDecided = false;

  constructor() {
    effect(() => {
      const query = this.query();
      this.form.setValue(toFormValue(query), { emitEvent: false });

      if (!this.openDecided) {
        this.openDecided = true;
        this.panelOpen.set(activeFilterCount(query) > 0);
      }

      if (!this.moreFiltersOpenDecided) {
        this.moreFiltersOpenDecided = true;
        this.moreFiltersOpen.set(
          query.minJuniorScore !== undefined ||
            query.maxYearsRequired !== undefined ||
            query.postedWithinDays !== undefined,
        );
      }
    });
  }

  /** `<details>` opens and closes itself; this keeps the signal from going stale. */
  protected onPanelToggle(event: Event): void {
    this.panelOpen.set((event.target as HTMLDetailsElement).open);
  }

  protected onMoreFiltersToggle(event: Event): void {
    this.moreFiltersOpen.set((event.target as HTMLDetailsElement).open);
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

  protected errorFor(field: 'maxYearsRequired', label: string): string | null {
    return fieldError(this.form.get(field), label);
  }

  protected submit(): void {
    if (this.busy()) {
      return;
    }

    // A value typed into "Technologies" or "Country" and never confirmed with
    // Enter or a click is still a value the user entered — Search and Apply
    // filters are both ways of saying "use what's in this panel now", so
    // neither should discard a draft the box is still showing.
    for (const field of this.multiValueFields()) {
      field.commitDraft();
    }
    for (const field of this.countryFields()) {
      field.commitDraft();
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.apply.emit(toQuery(this.form.getRawValue()));
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
    minJuniorScore: query.minJuniorScore ?? 0,
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
  // 0 is the slider's rest position, not a chosen floor — score filters are
  // never negative, so "at least 0" would filter out nothing anyway.
  if (value.minJuniorScore > 0) {
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
