import { Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth/auth-service';
import { SavedJobsStore } from '../../core/saved-jobs/saved-jobs-store';
import { Button } from '../ui/button';

/**
 * Saves or unsaves one job for the signed-in visitor — the same control on the
 * job card, the job detail page and the saved-jobs page, all backed by the one
 * `SavedJobsStore` so a toggle in one place is reflected everywhere else.
 *
 * **Hidden for a signed-out visitor**, rather than shown disabled. `/saved-jobs`
 * is JWT-only end to end (`ARCHITECTURE.md` §8) — there is no anonymous action
 * this button could take, and a control that only ever answers 401 is worse
 * than no control.
 *
 * **Optimistic.** The label flips the instant the button is pressed;
 * `SavedJobsStore` is what rolls the change back on a failed request, so this
 * component only has to notice the failure and say so.
 */
@Component({
  selector: 'app-save-toggle',
  imports: [Button],
  templateUrl: './save-toggle.html',
  styleUrl: './save-toggle.scss',
  host: { class: 'save-toggle' },
})
export class SaveToggle {
  private readonly auth = inject(AuthService);
  private readonly store = inject(SavedJobsStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly jobId = input.required<string>();

  protected readonly visible = this.auth.isAuthenticated;
  protected readonly saved = computed(() => this.store.ids()?.has(this.jobId()) ?? false);
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);

  constructor() {
    this.store.ensureLoaded();
  }

  protected toggle(): void {
    if (this.busy()) {
      return;
    }

    const id = this.jobId();
    const wasSaved = this.saved();
    this.busy.set(true);
    this.failed.set(false);

    // `takeUntilDestroyed`: the row this button sits on can disappear out from
    // under it before the request settles — unsaving on the saved-jobs page
    // does exactly that — and a destroyed component has no business writing to
    // its own signals once that happens. `SavedJobsStore`'s own state (the
    // optimistic change and its rollback) is unaffected either way, since it
    // lives on the store, not on this component.
    const request = wasSaved ? this.store.remove(id) : this.store.save(id);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.busy.set(false),
      error: () => {
        this.busy.set(false);
        this.failed.set(true);
      },
    });
  }
}
