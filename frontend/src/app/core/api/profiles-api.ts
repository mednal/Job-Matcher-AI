import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api-base-url';
import { Profile, ProfileUpdate } from '../models/profile';

/**
 * `GET`/`PUT /profiles/me`. Both routes are authenticated and address only
 * `me` — there is no `/profiles/:id` to call, by design.
 */
@Injectable({ providedIn: 'root' })
export class ProfilesApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  /** Answers an empty profile (`updatedAt: null`) for an account that never saved one. */
  mine(): Observable<Profile> {
    return this.http.get<Profile>(`${this.baseUrl}/profiles/me`);
  }

  /**
   * A full replacement, not a merge: an omitted list is cleared. Callers send
   * every field the form owns, or they will silently empty the ones they left out.
   */
  update(update: ProfileUpdate): Observable<Profile> {
    return this.http.put<Profile>(`${this.baseUrl}/profiles/me`, update);
  }
}
