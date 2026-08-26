import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../api/api-base-url';
import { AuthTokens } from '../models/auth';
import { TokenStorage } from '../auth/token-storage';
import { SavedJobsStore } from './saved-jobs-store';

const BASE_URL = 'http://api.test/api/v1';
const TOKENS: AuthTokens = { accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 900 };

let store: SavedJobsStore;
let storage: TokenStorage;
let httpMock: HttpTestingController;

/** One turn of the macrotask queue — long enough for a zoneless `effect()` to flush. */
async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** The one `ensureLoaded()` request — a GET, so it is never confused with a
 *  `save`/`remove` call to the same path. Matched on `request.url`, which
 *  Angular's test client leaves free of query params (`search-page.spec.ts`'s
 *  own convention), since the request carries `?pageSize=50`. */
function pendingList() {
  return httpMock.expectOne(
    (request) => request.url === `${BASE_URL}/saved-jobs` && request.method === 'GET',
  );
}

beforeEach(() => {
  localStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: API_BASE_URL, useValue: BASE_URL },
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  storage = TestBed.inject(TokenStorage);
  httpMock = TestBed.inject(HttpTestingController);
});

afterEach(() => {
  httpMock.verify();
  localStorage.clear();
});

describe('SavedJobsStore', () => {
  it('starts with save state unknown', () => {
    store = TestBed.inject(SavedJobsStore);
    expect(store.ids()).toBeNull();
  });

  it('does nothing for a signed-out visitor', () => {
    store = TestBed.inject(SavedJobsStore);
    store.ensureLoaded();

    // No outstanding request: `afterEach`'s `httpMock.verify()` would fail if
    // `ensureLoaded()` had asked anyway.
    expect(store.ids()).toBeNull();
  });

  it('loads the saved ids once for the signed-in user', () => {
    storage.set(TOKENS);
    store = TestBed.inject(SavedJobsStore);

    store.ensureLoaded();
    store.ensureLoaded(); // A second call while the first is in flight asks nothing new.

    pendingList().flush({
      items: [{ jobId: 'job-1' }, { jobId: 'job-2' }],
      page: 1,
      pageSize: 50,
      total: 2,
    });

    expect(store.ids()).toEqual(new Set(['job-1', 'job-2']));
  });

  it('leaves save state unknown, and retries next time, when the load fails', () => {
    storage.set(TOKENS);
    store = TestBed.inject(SavedJobsStore);

    store.ensureLoaded();
    pendingList().flush(null, { status: 500, statusText: 'Error' });

    expect(store.ids()).toBeNull();

    store.ensureLoaded();
    pendingList().flush({ items: [], page: 1, pageSize: 50, total: 0 });
    expect(store.ids()).toEqual(new Set());
  });

  it('adds an id immediately, before the request settles', () => {
    storage.set(TOKENS);
    store = TestBed.inject(SavedJobsStore);

    store.save('job-1').subscribe();
    expect(store.ids()).toEqual(new Set(['job-1']));

    httpMock.expectOne(`${BASE_URL}/saved-jobs`).flush(null);
  });

  it('rolls a save back when the request fails', () => {
    storage.set(TOKENS);
    store = TestBed.inject(SavedJobsStore);
    let failed = false;

    store.save('job-1').subscribe({ error: () => (failed = true) });
    httpMock.expectOne(`${BASE_URL}/saved-jobs`).flush(null, { status: 500, statusText: 'Error' });

    expect(failed).toBe(true);
    expect(store.ids()?.has('job-1')).toBe(false);
  });

  it('removes an id immediately, and restores it if the request fails', () => {
    storage.set(TOKENS);
    store = TestBed.inject(SavedJobsStore);
    store.seed(['job-1']);

    store.remove('job-1').subscribe({ error: () => {} });
    expect(store.ids()?.has('job-1')).toBe(false);

    httpMock
      .expectOne(`${BASE_URL}/saved-jobs/job-1`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    expect(store.ids()?.has('job-1')).toBe(true);
  });

  it('merges seeded ids without discarding what it already knew', () => {
    storage.set(TOKENS);
    store = TestBed.inject(SavedJobsStore);

    store.seed(['job-1']);
    store.seed(['job-2']);

    expect(store.ids()).toEqual(new Set(['job-1', 'job-2']));
    httpMock.expectNone((request) => request.url.startsWith(`${BASE_URL}/saved-jobs`));
  });

  it('forgets what it knew once the session ends', async () => {
    storage.set(TOKENS);
    store = TestBed.inject(SavedJobsStore);
    store.seed(['job-1']);
    expect(store.ids()).not.toBeNull();

    storage.clear();
    await tick();

    expect(store.ids()).toBeNull();
  });
});
