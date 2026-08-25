import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { rxResource } from '@angular/core/rxjs-interop';
import { ProfilesApi } from '../../core/api/profiles-api';
import { ApiError } from '../../core/models/api-error';
import { WORKPLACE_TYPES, WorkplaceType } from '../../core/models/enums';
import {
  MAX_PROFILE_ENTRY_LENGTH,
  MAX_PROFILE_LIST_LENGTH,
  MAX_YEARS_OF_EXPERIENCE,
  Profile,
  ProfileUpdate,
} from '../../core/models/profile';
import { workplaceTypeLabel } from '../../shared/enum-labels';
import { MultiValueField } from '../../shared/multi-value-field/multi-value-field';
import { Button } from '../../shared/ui/button';
import { InputField } from '../../shared/ui/input';
import { Spinner } from '../../shared/ui/spinner';

interface ProfileFormValue {
  displayName: string;
  yearsOfExperience: number | null;
  desiredRoles: string[];
  technologies: string[];
  locations: string[];
  countryCodes: string[];
  workplaceTypes: WorkplaceType[];
}

/**
 * The search profile: what the user is looking for, in the vocabulary the search
 * itself is expressed in (M11.9). Behind `authGuard`, like the endpoint —
 * `/profiles/me` addresses only the caller, so there is no profile to render
 * without a session.
 *
 * **The form is the whole profile, every time.** `PUT /profiles/me` is a full
 * replacement rather than a merge (`ARCHITECTURE.md` §8 lists no PATCH), so
 * `submit` sends every field the form owns. Emptying a list here is how a list is
 * emptied at all; a form that posted only what changed could never express it.
 *
 * **What comes back replaces what was typed.** The server normalizes as it writes
 * — technologies become lowercase slugs, duplicates collapse, country codes
 * uppercase — so the saved response is fed back into the form. The user then sees
 * what is actually stored rather than the spelling they used, which is also the
 * vocabulary the search matches against.
 */
@Component({
  selector: 'app-profile-page',
  imports: [Button, InputField, MultiValueField, ReactiveFormsModule, Spinner],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss',
})
export class ProfilePage {
  private readonly profiles = inject(ProfilesApi);

  protected readonly workplaceTypes = WORKPLACE_TYPES;
  protected readonly workplaceLabel = workplaceTypeLabel;
  protected readonly maxEntryLength = MAX_PROFILE_ENTRY_LENGTH;
  protected readonly maxListLength = MAX_PROFILE_LIST_LENGTH;
  protected readonly maxYears = MAX_YEARS_OF_EXPERIENCE;

  /** Technology slugs are lowercase by definition of the stored vocabulary. */
  protected readonly lowercase = (value: string): string => value.toLowerCase();
  protected readonly uppercase = (value: string): string => value.toUpperCase();

  protected readonly form = new FormGroup({
    displayName: new FormControl('', { nonNullable: true }),
    // Nullable on purpose: clearing a number box yields `null`, and "I have not
    // said" is a legitimate state of this field. It is sent as 0, which is the
    // same value the backend defaults an omitted field to.
    yearsOfExperience: new FormControl<number | null>(null),
    desiredRoles: new FormControl<string[]>([], { nonNullable: true }),
    technologies: new FormControl<string[]>([], { nonNullable: true }),
    locations: new FormControl<string[]>([], { nonNullable: true }),
    countryCodes: new FormControl<string[]>([], { nonNullable: true }),
    workplaceTypes: new FormControl<WorkplaceType[]>([], { nonNullable: true }),
  });

  private readonly resource = rxResource({ stream: () => this.profiles.mine() });

  // As on the search, detail and saved-jobs pages: `value()` throws in the error
  // state, so it is read through `hasValue()` rather than trusting `error()` to
  // stay in step with it.
  private readonly loaded = computed(() =>
    this.resource.hasValue() ? this.resource.value() : null,
  );

  protected readonly loading = computed(() => this.resource.isLoading() && this.loaded() === null);
  protected readonly loadError = computed(() => this.resource.error() !== undefined);

  /** `null` until the profile has been saved once — §3.1's "never saved" marker. */
  protected readonly neverSaved = computed(() => this.loaded()?.updatedAt === null);

  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly serverErrors = signal<string[]>([]);

  constructor() {
    effect(() => {
      const profile = this.loaded();
      if (profile !== null) {
        this.form.setValue(toFormValue(profile), { emitEvent: false });
      }
    });
  }

  protected toggle(member: WorkplaceType): void {
    const control = this.form.controls.workplaceTypes;
    const current = control.value;
    control.setValue(
      current.includes(member) ? current.filter((kept) => kept !== member) : [...current, member],
    );
  }

  protected isOn(member: WorkplaceType): boolean {
    return this.form.controls.workplaceTypes.value.includes(member);
  }

  protected submit(): void {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.saved.set(false);
    this.serverErrors.set([]);

    this.profiles.update(toUpdate(this.form.getRawValue())).subscribe({
      next: (profile) => {
        this.saving.set(false);
        this.saved.set(true);
        // Feeds the effect above, so the form redraws from what was stored.
        this.resource.set(profile);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.serverErrors.set(messagesFor(error));
      },
    });
  }

  protected retry(): void {
    this.resource.reload();
  }
}

function toFormValue(profile: Profile): ProfileFormValue {
  return {
    displayName: profile.displayName ?? '',
    yearsOfExperience: profile.yearsOfExperience,
    desiredRoles: [...profile.desiredRoles],
    technologies: [...profile.technologies],
    locations: [...profile.locations],
    countryCodes: [...profile.countryCodes],
    workplaceTypes: [...profile.workplaceTypes],
  };
}

/**
 * Every field, including the empty ones — replacement semantics. The one
 * exception is `displayName`: the DTO takes a non-empty string or nothing at all,
 * so a cleared box is sent by *omission*, which is what clears it server-side.
 */
function toUpdate(value: ProfileFormValue): ProfileUpdate {
  const displayName = value.displayName.trim();

  return {
    ...(displayName.length > 0 ? { displayName } : {}),
    yearsOfExperience: value.yearsOfExperience ?? 0,
    desiredRoles: value.desiredRoles,
    technologies: value.technologies,
    locations: value.locations,
    countryCodes: value.countryCodes,
    workplaceTypes: value.workplaceTypes,
  };
}

/**
 * The server's own wording where it has any — a rejected country code or an
 * over-long entry names the field it came from, which a generic sentence could
 * not.
 */
function messagesFor(error: unknown): string[] {
  if (error instanceof ApiError) {
    return error.messages.length > 0 ? error.messages : ['Your profile could not be saved.'];
  }
  return ['Your profile could not be saved. Please try again.'];
}
