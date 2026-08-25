import { Component, computed, input, output, signal } from '@angular/core';
import { MAX_FILTER_VALUES } from '../../core/models/search';
import { Button } from '../ui/button';
import { Chip } from '../ui/chip';
import { InputField } from '../ui/input';

/**
 * A field that holds several values at once — the search panel's technologies and
 * locations, and the same lists on the profile form.
 *
 * Both parameters are lists on the wire (`ARCHITECTURE.md` §8.1) and several values
 * *widen* the search, so the field has to be able to say "Berlin or Munich". A
 * single comma-separated text box cannot: `locations` is free text where "Berlin,
 * Germany" is one plausible value, which is exactly why the backend refuses to
 * split that parameter on commas. Entering one value at a time removes the
 * ambiguity instead of inventing a separator that a value could contain.
 *
 * Presentational, and not a `ControlValueAccessor`: the panel holds the values in a
 * `FormControl<string[]>` and passes them in and out. Writing an accessor for a
 * control that is not a native element is where touched/dirty state and
 * `setDisabledState` go wrong, and nothing here needs Angular's validation.
 */
@Component({
  selector: 'app-multi-value-field',
  imports: [Button, Chip, InputField],
  templateUrl: './multi-value-field.html',
  styleUrl: './multi-value-field.scss',
  host: { class: 'multi-value' },
})
export class MultiValueField {
  readonly label = input.required<string>();
  /** Used for the `<label for>` pairing, so the field is reachable by its name. */
  readonly fieldId = input.required<string>();
  readonly placeholder = input('');
  readonly hint = input<string | null>(null);
  readonly values = input<readonly string[]>([]);
  readonly maxLength = input(100);
  /**
   * How many values the field accepts. The default is the search filters' cap; the
   * profile form's lists are allowed more (`MAX_PROFILE_LIST_LENGTH`), and each
   * caller passes the cap its own endpoint enforces rather than this component
   * guessing which one it is being used for.
   */
  readonly maxValues = input(MAX_FILTER_VALUES);
  /**
   * Applied to every entered value — `technologies` are lowercase slugs, because
   * that is the vocabulary `Job.technologies[]` is stored in.
   */
  readonly normalize = input<(value: string) => string>((value) => value);

  readonly valuesChange = output<string[]>();

  protected readonly draft = signal('');

  /** The backend rejects a longer list outright, so the field stops before it. */
  protected readonly full = computed(() => this.values().length >= this.maxValues());

  protected add(): void {
    const value = this.normalize()(this.draft().trim().replace(/\s+/g, ' '));

    // A duplicate is not an error worth reporting: the value the user asked for is
    // already there, so clearing the box is the honest acknowledgement.
    if (value.length > 0 && !this.full() && !this.values().includes(value)) {
      this.valuesChange.emit([...this.values(), value]);
    }

    this.draft.set('');
  }

  protected remove(value: string): void {
    this.valuesChange.emit(this.values().filter((kept) => kept !== value));
  }

  /**
   * Enter adds the value instead of submitting the form around it. Without the
   * `preventDefault` the panel's submit would fire with the half-typed value still
   * sitting in the box and never reaching the query.
   */
  protected onEnter(event: Event): void {
    event.preventDefault();
    this.add();
  }

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }
}
