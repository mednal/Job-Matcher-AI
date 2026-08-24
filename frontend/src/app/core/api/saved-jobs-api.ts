import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api-base-url';
import { PageRequest, Paginated } from '../models/pagination';
import { SavedJob } from '../models/saved-job';
import { toPageParams } from './search-params';

/**
 * `GET`/`POST /saved-jobs` and `DELETE /saved-jobs/:jobId`. Every route is
 * authenticated; the collection is always the caller's, so no route names a user.
 */
@Injectable({ providedIn: 'root' })
export class SavedJobsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  list(page: PageRequest = {}): Observable<Paginated<SavedJob>> {
    return this.http.get<Paginated<SavedJob>>(`${this.baseUrl}/saved-jobs`, {
      params: toPageParams(page),
    });
  }

  /** Idempotent: saving an already-saved job succeeds again with no body. */
  save(jobId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/saved-jobs`, { jobId });
  }

  /**
   * Takes the id **as saved**, which after a merge is `SavedJob.jobId` and not
   * `SavedJob.job.id`. Unsaving something that was not saved is a 404, so an
   * optimistic UI has a real failure to roll back on.
   */
  remove(jobId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/saved-jobs/${jobId}`);
  }
}
