import { effect, inject, Injectable, signal } from '@angular/core';
import { finalize, Observable, ReplaySubject } from 'rxjs';
import { AuthService } from '../auth/auth-service';
import { SavedJobsApi } from '../api/saved-jobs-api';
import { MAX_PAGE_SIZE } from '../models/pagination';

/**
 * Which jobs the signed-in user has saved — shared by every place a save
 * control can appear (the job card in search results, the job detail page,
 * the saved-jobs page itself), so toggling one reflects in the others without
 * each place re-fetching the whole collection.
 *
 * **Known MVP limitation**: the background load reads one page of up to
 * `MAX_PAGE_SIZE` (50) saved jobs, most recently saved first. A user with more
 * than that sees correct save state for their 50 most recent saves and an
 * (incorrectly) unsaved toggle beyond it. `save`/`remove` still work correctly
 * for any job regardless — this only affects whether a card *shows* the job as
 * already saved before the visitor acts on it. The saved-jobs page itself is
 * unaffected: it seeds this store with whatever page it actually fetched
 * (`seed`), so what is on screen there is always accurate.
 */
@Injectable({ providedIn: 'root' })
export class SavedJobsStore {
  private readonly api = inject(SavedJobsApi);
  private readonly auth = inject(AuthService);

  private readonly idsSignal = signal<ReadonlySet<string> | null>(null);
  private loading = false;
  // Tracked apart from `idsSignal`, which `seed` can fill in from a partial
  // page: "we know some ids" is not "we have loaded the collection", and the
  // background load must still run after a seed.
  private loaded = false;

  /** `null` until loaded — "unknown", not "nothing saved". */
  readonly ids = this.idsSignal.asReadonly();

  constructor() {
    // A session ending invalidates what it knew; the next sign-in (or another
    // account, on a shared machine) starts from "unknown" rather than showing
    // a previous session's saves.
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        this.idsSignal.set(null);
        this.loaded = false;
      }
    });
  }

  /**
   * Triggers the background load if nothing is known yet. Safe to call from
   * every `SaveToggle` instance on a page — the guard makes every call after
   * the first a no-op, so a result list with twenty cards issues one request.
   */
  ensureLoaded(): void {
    if (this.loaded || this.loading || !this.auth.isAuthenticated()) {
      return;
    }
    this.loading = true;
    this.api
      .list({ pageSize: MAX_PAGE_SIZE })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        // Merged rather than replaced: a concurrent `seed()` — the saved-jobs
        // page seeding the row it just fetched, from inside the very
        // `SaveToggle` this load was triggered by — must not be clobbered by
        // a slower response that happens to land after it.
        next: (page) => {
          this.loaded = true;
          this.seed(page.items.map((entry) => entry.jobId));
        },
        // A failed background load just leaves save state unknown; toggles
        // still work (they set their own id), and the next `ensureLoaded()`
        // — the next page visit — tries again.
        error: () => {},
      });
  }

  /** Merges known ids in directly, bypassing the load — what the saved-jobs
   *  page uses so a row it just fetched is never mistaken for unsaved, even
   *  past the `MAX_PAGE_SIZE` background-load cap. */
  seed(jobIds: Iterable<string>): void {
    const current = this.idsSignal();
    const next = new Set(current ?? []);
    for (const id of jobIds) {
      next.add(id);
    }
    // Nothing new to say: keep the existing set rather than publishing an
    // equal-but-different one, so a re-seed of an already-known page does not
    // wake every `SaveToggle` (or any effect reading `ids`) for no reason.
    if (current !== null && next.size === current.size) {
      return;
    }
    this.idsSignal.set(next);
  }

  /** Optimistic: `ids` gains the id before the request settles, and loses it
   *  again if the request fails — the caller only has to show the failure. */
  save(jobId: string): Observable<void> {
    this.setSaved(jobId, true);
    return this.send(this.api.save(jobId), () => this.setSaved(jobId, false));
  }

  remove(jobId: string): Observable<void> {
    this.setSaved(jobId, false);
    return this.send(this.api.remove(jobId), () => this.setSaved(jobId, true));
  }

  /**
   * Runs the write on the store's own subscription instead of the caller's.
   * The control that started it can be destroyed before the response lands —
   * unsaving on the saved-jobs page removes the very row the button sits on —
   * and an unsubscribing caller must not cancel a write already in flight.
   * The returned observable only reports the outcome, replayed for a
   * subscriber that arrives after it settles.
   */
  private send(request: Observable<void>, rollback: () => void): Observable<void> {
    const outcome = new ReplaySubject<void>(1);
    request.subscribe({
      next: () => outcome.next(),
      error: (error: unknown) => {
        rollback();
        outcome.error(error);
      },
      complete: () => outcome.complete(),
    });
    return outcome.asObservable();
  }

  private setSaved(jobId: string, saved: boolean): void {
    const next = new Set(this.idsSignal() ?? []);
    if (saved) {
      next.add(jobId);
    } else {
      next.delete(jobId);
    }
    this.idsSignal.set(next);
  }
}
