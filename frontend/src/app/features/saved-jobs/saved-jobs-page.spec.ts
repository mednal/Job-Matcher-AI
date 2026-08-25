import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL } from '../../core/api/api-base-url';
import { errorInterceptor } from '../../core/interceptors/error-interceptor';
import { AuthTokens } from '../../core/models/auth';
import { TokenStorage } from '../../core/auth/token-storage';
import { JobSummary } from '../../core/models/job';
import { Paginated } from '../../core/models/pagination';
import { SavedJob } from '../../core/models/saved-job';
import { SavedJobsPage } from './saved-jobs-page';

const BASE_URL = 'http://api.test/api/v1';
const TOKENS: AuthTokens = { accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 900 };

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
  postedAt: null,
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

function savedJob(overrides: Partial<SavedJob> = {}): SavedJob {
  return {
    jobId: JOB.id,
    savedAt: '2026-08-22T09:00:00.000Z',
    isActive: true,
    redirectedToJobId: null,
    job: JOB,
    ...overrides,
  };
}

function page(
  items: SavedJob[],
  overrides: Partial<Paginated<SavedJob>> = {},
): Paginated<SavedJob> {
  return { items, page: 1, pageSize: 20, total: items.length, ...overrides };
}

let httpMock: HttpTestingController;
let storage: TokenStorage;

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  localStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: API_BASE_URL, useValue: BASE_URL },
      provideRouter([]),
      provideHttpClient(withInterceptors([errorInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  httpMock = TestBed.inject(HttpTestingController);
  storage = TestBed.inject(TokenStorage);
  // Every real visitor to this page is authenticated — `authGuard` (`app.routes.ts`)
  // will not route here otherwise — so `SaveToggle` renders its control on every
  // card, and `SavedJobsStore`'s background load fires once the first one mounts.
  storage.set(TOKENS);
});

afterEach(() => httpMock.verify());

/** The page's own list request — always `pageSize=20`. */
function pendingPage() {
  return httpMock.expectOne(
    (request) => request.method === 'GET' && request.params.get('pageSize') === '20',
  );
}

/** `SavedJobsStore`'s background load, triggered by the first `SaveToggle`
 *  that mounts — always `pageSize=50`. Present only once a card has rendered. */
function pendingStoreLoad() {
  return httpMock.expectOne(
    (request) => request.method === 'GET' && request.params.get('pageSize') === '50',
  );
}

async function render() {
  const fixture = TestBed.createComponent(SavedJobsPage);
  fixture.detectChanges();
  await tick();
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    element,
    text: () => element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    titles: () =>
      Array.from(element.querySelectorAll('.job-card__title'), (node) => node.textContent?.trim()),
    async settle(response: Paginated<SavedJob>) {
      pendingPage().flush(response);
      await tick();
      fixture.detectChanges();
      await tick();
      fixture.detectChanges();
    },
    async click(label: string) {
      Array.from(element.querySelectorAll('button'))
        .find((node) => node.textContent?.trim() === label)!
        .click();
      await tick();
      fixture.detectChanges();
    },
  };
}

describe('SavedJobsPage', () => {
  it('shows a spinner before the list arrives', async () => {
    const view = await render();
    expect(view.element.querySelector('app-spinner')).not.toBeNull();

    await view.settle(page([savedJob()]));
    pendingStoreLoad().flush(page([savedJob()]));
    await tick();
  });

  it('lists the saved jobs', async () => {
    const view = await render();
    await view.settle(page([savedJob()]));
    pendingStoreLoad().flush(page([savedJob()]));
    await tick();
    view.fixture.detectChanges();

    expect(view.titles()).toEqual(['Junior Java Developer']);
    expect(view.text()).toContain('1 job saved');
  });

  it('shows the empty state when nothing is saved', async () => {
    const view = await render();
    await view.settle(page([]));

    expect(view.text()).toContain('No saved jobs yet');
  });

  it('flags a job no source lists any more, without hiding it', async () => {
    const view = await render();
    await view.settle(page([savedJob({ isActive: false })]));
    pendingStoreLoad().flush(page([savedJob({ isActive: false })]));
    await tick();
    view.fixture.detectChanges();

    expect(view.text()).toContain('No source is listing this posting any more');
    expect(view.titles()).toEqual(['Junior Java Developer']);
  });

  it('notes a saved job that was merged into another listing', async () => {
    const view = await render();
    await view.settle(page([savedJob({ redirectedToJobId: 'job-2' })]));
    pendingStoreLoad().flush(page([savedJob({ redirectedToJobId: 'job-2' })]));
    await tick();
    view.fixture.detectChanges();

    expect(view.text()).toContain('merged into another listing');
  });

  it('shows the server’s own words when the request fails, and retries it', async () => {
    const view = await render();
    pendingPage().flush(
      { statusCode: 500, message: 'Something broke' },
      { status: 500, statusText: 'Error' },
    );
    await tick();
    view.fixture.detectChanges();

    expect(view.element.querySelector('[role="alert"]')!.textContent).toContain('Something broke');

    await view.click('Try again');
    await view.settle(page([savedJob()]));
    pendingStoreLoad().flush(page([savedJob()]));
    await tick();
    view.fixture.detectChanges();
    expect(view.titles()).toEqual(['Junior Java Developer']);
  });

  /**
   * The milestone's own verification line: saving from search must reflect on
   * this page. This page always re-fetches on its own — this proves the other
   * half, that unsaving *from here* removes the row without a second fetch.
   */
  it('removes a row immediately on unsave, without waiting for a reload', async () => {
    const view = await render();
    await view.settle(page([savedJob()]));
    pendingStoreLoad().flush(page([savedJob()]));
    await tick();
    view.fixture.detectChanges();

    expect(view.titles()).toEqual(['Junior Java Developer']);

    await view.click('Saved');
    expect(view.titles()).toEqual([]);
    expect(view.text()).toContain('No saved jobs yet');

    httpMock.expectOne(`${BASE_URL}/saved-jobs/${JOB.id}`).flush(null);
  });
});
