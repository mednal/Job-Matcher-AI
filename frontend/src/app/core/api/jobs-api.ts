import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api-base-url';
import { JobDetail, JobSummary } from '../models/job';
import { PageRequest, Paginated } from '../models/pagination';
import { SearchQuery } from '../models/search';
import { toPageParams, toSearchParams } from './search-params';

/**
 * `GET /jobs`, `GET /jobs/search`, `GET /jobs/:id`.
 *
 * All three are readable without a token, so the product is browsable before
 * signup. Search is *personalized* when a token is present — the interceptor
 * attaches it and the backend reorders by profile fit — which is why nothing
 * here has a "personalized" flag to pass.
 */
@Injectable({ providedIn: 'root' })
export class JobsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  list(page: PageRequest = {}): Observable<Paginated<JobSummary>> {
    return this.http.get<Paginated<JobSummary>>(`${this.baseUrl}/jobs`, {
      params: toPageParams(page),
    });
  }

  search(query: SearchQuery = {}): Observable<Paginated<JobSummary>> {
    return this.http.get<Paginated<JobSummary>>(`${this.baseUrl}/jobs/search`, {
      params: toSearchParams(query),
    });
  }

  /**
   * A merged-away id still resolves: the backend serves the surviving job and
   * sets `redirectedFromJobId`, so a stale link opens the right posting rather
   * than a 404.
   */
  detail(id: string): Observable<JobDetail> {
    return this.http.get<JobDetail>(`${this.baseUrl}/jobs/${id}`);
  }
}
