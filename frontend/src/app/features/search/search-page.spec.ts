import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { API_BASE_URL } from '../../core/api/api-base-url';
import { TokenStorage } from '../../core/auth/token-storage';
import { errorInterceptor } from '../../core/interceptors/error-interceptor';
import { AuthTokens } from '../../core/models/auth';
import { JobSummary } from '../../core/models/job';
import { Paginated } from '../../core/models/pagination';
import { Profile } from '../../core/models/profile';
import { SearchPage } from './search-page';

const BASE_URL = 'http://api.test/api/v1';

const JOB: JobSummary = {
  id: 'job-1',
  title: 'Junior Java Developer',
  companyName: 'Example Company',
  location: 'Berlin, Germany',
  countryCode: 'DE',
  workplaceType: 'HYBRID',
  employmentType: 'FULL_TIME',
  language: 'en',
  technologies: ['java'],
  postedAt: '2026-08-20T09:00:00.000Z',
  effectivePostedAt: '2026-08-20T09:00:00.000Z',
  juniorLevel: 'ENTRY_LEVEL',
  juniorScore: 94,
  requiredMinYears: 0,
  requiredMaxYears: 1,
  positiveSignals: [],
  negativeSignals: [],
  juniorTitleContradicted: false,
  sourceCount: 1,
};

function page(overrides: Partial<Paginated<JobSummary>> = {}): Paginated<JobSummary> {
  return { items: [JOB], page: 1, pageSize: 20, total: 1, ...overrides };
}

const TOKENS: AuthTokens = { accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 900 };

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    displayName: null,
    yearsOfExperience: 0,
    desiredRoles: [],
    technologies: [],
    locations: [],
    countryCodes: [],
    workplaceTypes: [],
    updatedAt: '2026-08-24T09:00:00.000Z',
    ...overrides,
  };
}

/** M11.9 — signing in is what makes the page read the profile at all. */
function signIn(): void {
  TestBed.inject(TokenStorage).set(TOKENS);
}

/**
 * Signing in also puts a `SaveToggle` on every card (M11.8), and the first one to
 * mount asks `SavedJobsStore` for what is already saved. It is nothing to do with
 * the search, but it is a real open request, so it has to be answered.
 */
function answerSavedJobs(): void {
  httpMock
    .expectOne((request) => request.url === `${BASE_URL}/saved-jobs`)
    .flush({ items: [], page: 1, pageSize: 50, total: 0 });
}

let httpMock: HttpTestingController;

beforeEach(() => {
  localStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: API_BASE_URL, useValue: BASE_URL },
      provideRouter([{ path: 'jobs', component: SearchPage }]),
      // The same chain the application provides: the page renders `ApiError`
      // messages, which only exist because `errorInterceptor` produces them.
      provideHttpClient(withInterceptors([errorInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  httpMock = TestBed.inject(HttpTestingController);
});

afterEach(() => {
  httpMock.verify();
  localStorage.clear();
});

/**
 * The one search the page has in flight. `expectOne` *takes* the request out of
 * the open list, so it is captured once and answered through `answer`.
 */
function pendingSearch(): TestRequest {
  return httpMock.expectOne((request) => request.url === `${BASE_URL}/jobs/search`);
}

/**
 * One turn of the macrotask queue.
 *
 * `fixture.whenStable()` cannot be used here: `HttpClient` registers each in-flight
 * request as a pending task, and a request held open by `HttpTestingController`
 * never completes — so waiting for stability would wait for the very request the
 * test is about to answer.
 */
async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function open(url: string) {
  const harness = await RouterTestingHarness.create(url);
  harness.detectChanges();

  const element = harness.routeNativeElement!;

  return {
    harness,
    element,
    text: () => element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    titles: () =>
      Array.from(element.querySelectorAll('.job-card__title'), (node) => node.textContent?.trim()),
    url: () => TestBed.inject(Router).url,
    /** The search the page is waiting on, so a test can read what it asked for. */
    search: () => pendingSearch(),
    async answer(request: TestRequest, response: Paginated<JobSummary> = page()) {
      request.flush(response);
      await tick();
      harness.detectChanges();
    },
    async settle(response: Paginated<JobSummary> = page()) {
      pendingSearch().flush(response);
      await tick();
      harness.detectChanges();
    },
    async fail(status: number, body: object) {
      pendingSearch().flush(body, { status, statusText: 'Bad Request' });
      await tick();
      harness.detectChanges();
    },
    /** Anything that navigates: the router settles a turn after the click. */
    async click(label: string) {
      Array.from(element.querySelectorAll('button'))
        .find((node) => node.textContent?.trim() === label)!
        .click();
      await tick();
      harness.detectChanges();
    },
    check(label: string) {
      const box = Array.from(element.querySelectorAll('label.filters__choice')).find((node) =>
        node.textContent?.includes(label),
      )!.firstElementChild as HTMLInputElement;
      box.dispatchEvent(new Event('change'));
      harness.detectChanges();
    },
    type(selector: string, value: string) {
      const input = element.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      harness.detectChanges();
    },
    async choose(selector: string, value: string) {
      const select = element.querySelector<HTMLSelectElement>(selector)!;
      select.value = value;
      select.dispatchEvent(new Event('change'));
      await tick();
      harness.detectChanges();
    },
  };
}

describe('SearchPage', () => {
  it('searches with no parameters when the URL carries none', async () => {
    const view = await open('/jobs');
    const search = view.search();

    expect(search.request.params.keys()).toEqual([]);
    await view.answer(search);
  });

  /**
   * The milestone's own verification: a filtered URL is the search. Nothing is
   * restored from storage and nothing is re-entered — the address bar is parsed and
   * the same request goes out, which is what makes a search shareable.
   */
  it('restores the whole search from a filtered URL', async () => {
    const view = await open(
      '/jobs?q=java&technologies=java&technologies=spring-boot&locations=Berlin,%20Germany' +
        '&countryCode=DE&workplaceType=REMOTE&employmentType=INTERNSHIP&juniorLevel=ENTRY_LEVEL' +
        '&minJuniorScore=70&maxYearsRequired=2&postedWithinDays=30&sort=juniorScore&page=2&pageSize=50',
    );

    const search = view.search();
    const params = search.request.params;
    expect(params.get('q')).toBe('java');
    expect(params.getAll('technologies')).toEqual(['java', 'spring-boot']);
    expect(params.getAll('locations')).toEqual(['Berlin, Germany']);
    expect(params.getAll('countryCode')).toEqual(['DE']);
    expect(params.getAll('workplaceType')).toEqual(['REMOTE']);
    expect(params.getAll('employmentType')).toEqual(['INTERNSHIP']);
    expect(params.getAll('juniorLevel')).toEqual(['ENTRY_LEVEL']);
    expect(params.get('minJuniorScore')).toBe('70');
    expect(params.get('maxYearsRequired')).toBe('2');
    expect(params.get('postedWithinDays')).toBe('30');
    expect(params.get('sort')).toBe('juniorScore');
    expect(params.get('page')).toBe('2');
    expect(params.get('pageSize')).toBe('50');

    await view.answer(search, page({ page: 2, pageSize: 50, total: 137 }));
  });

  it('answers the rest of a URL one parameter of which is unusable', async () => {
    const view = await open('/jobs?q=java&minJuniorScore=abc');

    const search = view.search();
    const params = search.request.params;
    expect(params.get('q')).toBe('java');
    expect(params.has('minJuniorScore')).toBe(false);

    await view.answer(search);
  });

  it('says it is searching before the results arrive', async () => {
    const view = await open('/jobs');

    expect(view.element.querySelector('app-spinner')).not.toBeNull();
    await view.settle();
    expect(view.element.querySelector('app-spinner')).toBeNull();
  });

  it('renders a result as a job card', async () => {
    const view = await open('/jobs');
    await view.settle(page({ total: 1 }));

    expect(view.titles()).toEqual(['Junior Java Developer']);
    expect(view.text()).toContain('1 job found');
  });

  it('says a search matched nothing, and what to do about it', async () => {
    const view = await open('/jobs?workplaceType=REMOTE');
    await view.settle(page({ items: [], total: 0 }));

    expect(view.text()).toContain('No jobs match this search');
    expect(view.text()).toContain('Try removing a filter');
  });

  it('says something different when nothing has been searched for yet', async () => {
    const view = await open('/jobs');
    await view.settle(page({ items: [], total: 0 }));

    expect(view.text()).toContain('no jobs to show yet');
  });

  it('shows the server’s own words when the search fails, and retries it', async () => {
    const view = await open('/jobs?q=java');
    await view.fail(400, {
      statusCode: 400,
      message: 'minJuniorScore must not be greater than 100',
    });

    expect(view.element.querySelector('[role="alert"]')?.textContent).toContain(
      'minJuniorScore must not be greater than 100',
    );

    // The retry re-runs the same search rather than sending the user back to
    // rebuild the filters they arrived with.
    await view.click('Try again');
    const retried = view.search();
    expect(retried.request.params.get('q')).toBe('java');
    await view.answer(retried);
  });

  it('applies a filter by putting it in the address bar', async () => {
    const view = await open('/jobs');
    await view.settle();

    view.check('Remote');
    await view.click('Apply filters');

    const narrowed = view.search();
    expect(view.url()).toBe('/jobs?workplaceType=REMOTE');
    expect(narrowed.request.params.getAll('workplaceType')).toEqual(['REMOTE']);
    await view.answer(narrowed);
  });

  it('starts a new filter set at the first page', async () => {
    const view = await open('/jobs?q=java&page=4');
    await view.settle(page({ page: 4, total: 137 }));

    await view.click('Search');

    expect(view.url()).toBe('/jobs?q=java');
    await view.settle();
  });

  it('keeps the chosen ordering when a filter is applied', async () => {
    const view = await open('/jobs?sort=postedAt');
    await view.settle();

    await view.click('Search');

    // No second request: the URL did not move, so there is nothing new to ask.
    expect(view.url()).toBe('/jobs?sort=postedAt');
  });

  it('pages by moving the URL, so the page is part of the link', async () => {
    const view = await open('/jobs?q=java');
    await view.settle(page({ total: 137 }));

    await view.click('Next');

    const next = view.search();
    expect(view.url()).toBe('/jobs?q=java&page=2');
    expect(next.request.params.get('page')).toBe('2');
    await view.answer(next, page({ page: 2, total: 137 }));
  });

  /**
   * Paging reads the URL rather than the panel, so pressing Next cannot apply a
   * filter that was typed into the panel and never submitted.
   */
  it('does not carry an unsubmitted filter into the next page', async () => {
    const view = await open('/jobs?q=java');
    await view.settle(page({ total: 137 }));

    view.type('#search-country', 'DE');
    await view.click('Next');

    expect(view.url()).toBe('/jobs?q=java&page=2');
    await view.settle(page({ page: 2, total: 137 }));
  });

  it('re-orders from the first page', async () => {
    const view = await open('/jobs?q=java&page=3');
    await view.settle(page({ page: 3, total: 137 }));

    await view.choose('#search-sort', 'postedAt');

    expect(view.url()).toBe('/jobs?q=java&sort=postedAt');
    await view.settle();
  });

  it('shows the ordering the URL asked for', async () => {
    const view = await open('/jobs?sort=juniorScore');
    await view.settle();

    expect(view.element.querySelector<HTMLSelectElement>('#search-sort')!.value).toBe(
      'juniorScore',
    );
  });

  /**
   * M11.9's own verification, from the search side: the saved profile is what a
   * signed-in user's first search starts from. It is seeded into the *URL*, so the
   * filters are visible in the panel and the search stays shareable.
   */
  it('starts a signed-in visitor from the filters their profile implies', async () => {
    signIn();
    const view = await open('/jobs');

    // The unfiltered search is not held back while the profile is read.
    await view.settle();
    answerSavedJobs();

    httpMock
      .expectOne(`${BASE_URL}/profiles/me`)
      .flush(profile({ technologies: ['java'], countryCodes: ['DE'], workplaceTypes: ['REMOTE'] }));
    await tick();
    view.harness.detectChanges();

    expect(view.url()).toContain('technologies=java');

    const seeded = view.search();
    expect(seeded.request.params.getAll('technologies')).toEqual(['java']);
    expect(seeded.request.params.getAll('countryCode')).toEqual(['DE']);
    expect(seeded.request.params.getAll('workplaceType')).toEqual(['REMOTE']);
    await view.answer(seeded);
  });

  /**
   * M11.12 — a profile naming two countries used to lose the filter entirely,
   * because the search took a single code and picking one of several would have
   * narrowed the search to a country the user never singled out. Widening the
   * parameter is what lets both through.
   */
  it('seeds every country a profile names', async () => {
    signIn();
    const view = await open('/jobs');

    await view.settle();
    answerSavedJobs();

    httpMock.expectOne(`${BASE_URL}/profiles/me`).flush(profile({ countryCodes: ['DE', 'AT'] }));
    await tick();
    view.harness.detectChanges();

    expect(view.url()).toContain('countryCode=DE');
    expect(view.url()).toContain('countryCode=AT');

    const seeded = view.search();
    expect(seeded.request.params.getAll('countryCode')).toEqual(['DE', 'AT']);
    await view.answer(seeded);
  });

  it('leaves a URL that already says something alone', async () => {
    signIn();
    const view = await open('/jobs?q=java');

    httpMock.expectNone(`${BASE_URL}/profiles/me`);
    await view.settle();
    answerSavedJobs();

    expect(view.url()).toBe('/jobs?q=java');
  });

  it('does not seed from an empty profile, so the URL stays clean', async () => {
    signIn();
    const view = await open('/jobs');
    await view.settle();
    answerSavedJobs();

    httpMock.expectOne(`${BASE_URL}/profiles/me`).flush(profile({ updatedAt: null }));
    await tick();
    view.harness.detectChanges();

    expect(view.url()).toBe('/jobs');
  });

  it('asks for no profile at all when nobody is signed in', async () => {
    const view = await open('/jobs');

    httpMock.expectNone(`${BASE_URL}/profiles/me`);
    await view.settle();
  });

  /**
   * The score is never presented as a hiring prediction, and the page says what it
   * is before the first result is read (`PRODUCT.md` §8).
   */
  it('explains what the Junior Match score is', async () => {
    const view = await open('/jobs');
    await view.settle();

    expect(view.text()).toContain('Junior Match');
    expect(view.text()).toContain('not a prediction of getting hired');
  });
});

/**
 * M11.11 — the chips. The page-level half: they describe the URL, and removing
 * one navigates. `search-query-params.spec.ts` owns what each chip *says*.
 */
describe('SearchPage — active filter chips', () => {
  const chips = (element: HTMLElement) =>
    Array.from(element.querySelectorAll('.search__chip-list li'), (node) =>
      node.textContent?.replace(/\s+/g, ' ').trim(),
    );

  const removeButton = (element: HTMLElement, index: number) =>
    element.querySelectorAll<HTMLButtonElement>('.search__chip-list .ui-chip__remove')[index];

  it('shows a chip for every filter in the URL, and none for the search text', async () => {
    const view = await open('/jobs?q=java&workplaceType=REMOTE&maxYearsRequired=2');
    await view.settle();

    expect(chips(view.element)).toEqual(['Remote ×', '2 years or fewer ×']);
  });

  it('shows nothing when no filter is on', async () => {
    const view = await open('/jobs?q=java');
    await view.settle();

    expect(view.element.querySelector('.search__chips')).toBeNull();
  });

  // The point of the whole feature: one filter off, the rest of the address bar
  // untouched.
  it('removing a chip drops that parameter and keeps the others', async () => {
    const view = await open('/jobs?q=java&workplaceType=REMOTE&maxYearsRequired=2');
    await view.settle();

    removeButton(view.element, 0).click();
    await tick();
    view.harness.detectChanges();

    expect(view.url()).toBe('/jobs?q=java&maxYearsRequired=2');
    await view.settle();
  });

  it('keeps the search text when every filter is cleared', async () => {
    const view = await open('/jobs?q=java&workplaceType=REMOTE');
    await view.settle();

    view.element.querySelector<HTMLButtonElement>('.search__chips button[appButton]')!.click();
    await tick();
    view.harness.detectChanges();

    expect(view.url()).toBe('/jobs?q=java');
    await view.settle();
  });
});
