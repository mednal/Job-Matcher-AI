import { Component, computed, input, output, signal } from '@angular/core';
import { MAX_FILTER_VALUES } from '../../core/models/search';
import { COUNTRIES, Country, countryName } from '../countries';
import { Chip } from '../ui/chip';
import { InputField } from '../ui/input';

/** How many matches the dropdown shows at once — enough to scan, not a scroll. */
const MAX_SUGGESTIONS = 8;

/**
 * A `Countries` field, in the same role as `MultiValueField` — the profile form's
 * and the search panel's list of ISO-3166 alpha-2 codes — but a searchable
 * dropdown rather than a free-text box. A country code is not something most
 * people carry around ("DE" for Germany); asking for the two letters directly
 * meant the field only worked for whoever already knew them. Typing a country's
 * *name* and picking it from a list works for everyone, and still stores the
 * code the backend validates against (`ARCHITECTURE.md` §8 — a valid
 * ISO31661 Alpha2 code).
 *
 * Not a `ControlValueAccessor`, for the same reason as `MultiValueField`: the
 * parent holds `values` in a `FormControl<string[]>` and this component is a
 * presentational view over it.
 */
@Component({
  selector: 'app-country-field',
  imports: [Chip, InputField],
  templateUrl: './country-field.html',
  styleUrl: './country-field.scss',
  host: { class: 'country-field' },
})
export class CountryField {
  readonly label = input.required<string>();
  /** Used for the `<label for>` pairing and to derive the listbox's own id. */
  readonly fieldId = input.required<string>();
  readonly hint = input<string | null>(null);
  readonly values = input<readonly string[]>([]);
  /** Same default as `MultiValueField` — the search filters' cap. */
  readonly maxValues = input(MAX_FILTER_VALUES);

  readonly valuesChange = output<string[]>();

  protected readonly draft = signal('');
  protected readonly open = signal(false);
  protected readonly activeIndex = signal(0);

  protected readonly listboxId = computed(() => `${this.fieldId()}-listbox`);

  /** The backend rejects a longer list outright, so the field stops before it. */
  protected readonly full = computed(() => this.values().length >= this.maxValues());

  protected readonly names = computed(() =>
    this.values().map((code) => ({ code, name: countryName(code) })),
  );

  /**
   * Countries not already picked, ranked by how the typed text matches: a name
   * starting with it before one that merely contains it, so typing "United"
   * meets United Kingdom and United States before Country matches buried in a
   * longer name — then capped, since the box is a handful of suggestions, not
   * the whole list rendered every keystroke.
   */
  protected readonly filtered = computed<readonly Country[]>(() => {
    const query = this.draft().trim().toLowerCase();
    if (query.length === 0) {
      return [];
    }

    const chosen = new Set(this.values());
    const starting: Country[] = [];
    const containing: Country[] = [];

    for (const country of COUNTRIES) {
      if (chosen.has(country.code)) {
        continue;
      }
      const name = country.name.toLowerCase();
      if (name.startsWith(query)) {
        starting.push(country);
      } else if (name.includes(query)) {
        containing.push(country);
      }
    }

    return [...starting, ...containing].slice(0, MAX_SUGGESTIONS);
  });

  protected readonly showList = computed(() => this.open() && this.filtered().length > 0);

  /**
   * The highlighted suggestion, clamped to the current list rather than trusted
   * to stay in range: `activeIndex` only resets on keystroke, so a stale index
   * left over from a longer list (arrowed down, then the query narrowed some
   * other way) must not reach past the end of a shorter one.
   */
  protected readonly activeOption = computed<Country | null>(() => {
    const options = this.filtered();
    if (options.length === 0) {
      return null;
    }
    return options[Math.min(this.activeIndex(), options.length - 1)];
  });

  protected readonly activeOptionId = computed(() => {
    const option = this.activeOption();
    return option ? this.optionId(option) : null;
  });

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
    this.open.set(true);
    this.activeIndex.set(0);
  }

  protected onFocus(): void {
    if (this.draft().trim().length > 0) {
      this.open.set(true);
    }
  }

  /**
   * A short delay, not an immediate close: without it, a `mousedown` on an
   * option fires blur first and the click that was meant to select never lands
   * on a list that has already unmounted.
   */
  protected onBlur(): void {
    setTimeout(() => this.open.set(false), 150);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const options = this.filtered();

    switch (event.key) {
      case 'ArrowDown':
        if (options.length > 0) {
          event.preventDefault();
          this.open.set(true);
          this.activeIndex.set((this.activeIndex() + 1) % options.length);
        }
        return;
      case 'ArrowUp':
        if (options.length > 0) {
          event.preventDefault();
          this.open.set(true);
          this.activeIndex.set((this.activeIndex() - 1 + options.length) % options.length);
        }
        return;
      case 'Enter':
        event.preventDefault();
        this.commitDraft();
        return;
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          this.open.set(false);
        }
        return;
      default:
        return;
    }
  }

  protected select(country: Country): void {
    if (this.full() || this.values().includes(country.code)) {
      this.draft.set('');
      this.open.set(false);
      return;
    }

    this.valuesChange.emit([...this.values(), country.code]);
    this.draft.set('');
    this.open.set(false);
  }

  /**
   * Flushes a match for whatever is typed but not yet picked from the list — the
   * highlighted suggestion, defaulting to the first. Mirrors
   * `MultiValueField.commitDraft`: the parent form calls this before reading the
   * field's values, so a name typed and never confirmed with Enter or a click is
   * still resolved rather than silently dropped. Text that matches nothing is
   * left in the box rather than invented into a code — there is no valid value
   * to fall back to.
   */
  commitDraft(): void {
    const option = this.activeOption();
    if (option !== null) {
      this.select(option);
    }
  }

  protected remove(code: string): void {
    this.valuesChange.emit(this.values().filter((kept) => kept !== code));
  }

  protected optionId(country: Country): string {
    return `${this.fieldId()}-option-${country.code}`;
  }
}
