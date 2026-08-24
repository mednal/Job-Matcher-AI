import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE_URL } from './api-base-url';
import { JobsApi } from './jobs-api';
import { ProfilesApi } from './profiles-api';
import { SavedJobsApi } from './saved-jobs-api';

const BASE_URL = 'http://api.test/api/v1';

describe('api clients', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: API_BASE_URL, useValue: BASE_URL },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('JobsApi', () => {
    it('lists jobs with no parameters when none are given', () => {
      TestBed.inject(JobsApi).list().subscribe();

      const request = httpMock.expectOne(`${BASE_URL}/jobs`);
      expect(request.request.method).toBe('GET');
      expect(request.request.params.keys()).toEqual([]);
      request.flush({ items: [], page: 1, pageSize: 20, total: 0 });
    });

    it('sends a search to /jobs/search with the filters serialized', () => {
      TestBed.inject(JobsApi)
        .search({ q: 'angular', juniorLevel: ['ENTRY_LEVEL'], minJuniorScore: 70 })
        .subscribe();

      const request = httpMock.expectOne(
        (candidate) => candidate.url === `${BASE_URL}/jobs/search`,
      );
      expect(request.request.params.get('q')).toBe('angular');
      expect(request.request.params.getAll('juniorLevel')).toEqual(['ENTRY_LEVEL']);
      expect(request.request.params.get('minJuniorScore')).toBe('70');
      request.flush({ items: [], page: 1, pageSize: 20, total: 0 });
    });

    it('reads one job by id', () => {
      TestBed.inject(JobsApi).detail('abc-123').subscribe();

      httpMock.expectOne(`${BASE_URL}/jobs/abc-123`).flush({ id: 'abc-123' });
    });
  });

  describe('ProfilesApi', () => {
    it('puts the whole profile, because the API replaces rather than merges', () => {
      TestBed.inject(ProfilesApi)
        .update({ technologies: ['java'], locations: [] })
        .subscribe();

      const request = httpMock.expectOne(`${BASE_URL}/profiles/me`);
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({ technologies: ['java'], locations: [] });
      request.flush({});
    });
  });

  describe('SavedJobsApi', () => {
    it('saves by job id in the body', () => {
      TestBed.inject(SavedJobsApi).save('abc-123').subscribe();

      const request = httpMock.expectOne(`${BASE_URL}/saved-jobs`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ jobId: 'abc-123' });
      request.flush(null);
    });

    it('unsaves by job id in the path', () => {
      TestBed.inject(SavedJobsApi).remove('abc-123').subscribe();

      const request = httpMock.expectOne(`${BASE_URL}/saved-jobs/abc-123`);
      expect(request.request.method).toBe('DELETE');
      request.flush(null);
    });
  });
});
