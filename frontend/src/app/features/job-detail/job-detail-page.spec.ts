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
import { errorInterceptor } from '../../core/interceptors/error-interceptor';
import { JobDetail } from '../../core/models/job';
import { JobDetailPage } from './job-detail-page';

const BASE_URL = 'http://api.test/api/v1';
const JOB_ID = '11111111-1111-1111-1111-111111111111';

/**
 * The seeded "Junior Backend Developer (Java)", trimmed to what a page renders.
 * It is the fixture the milestone's `Verify:` line names: a seeded job, its
 * evidence, and the two sources carrying it.
 */
const JOB: JobDetail = {
  id: JOB_ID,
  title: 'Junior Backend Developer (Java)',
  companyName: 'Aurelia Systems Ltd',
  location: 'Dublin',
  countryCode: 'IE',
  workplaceType: 'HYBRID',
  employmentType: 'FULL_TIME',
  language: 'en',
  description:
    'Aurelia Systems is hiring a Junior Backend Developer.\n\nThis is an entry level position.',
  technologies: ['java', 'spring-boot', 'postgresql'],
  postedAt: '2026-08-21T09:00:00.000Z',
  effectivePostedAt: '2026-08-21T09:00:00.000Z',
  isActive: true,
  juniorLevel: 'ENTRY_LEVEL',
  juniorScore: 94,
  requiredMinYears: 0,
  requiredMaxYears: 1,
  classifiedAt: '2026-08-21T10:00:00.000Z',
  classification: {
    classifierVersion: 'rules-1',
    level: 'ENTRY_LEVEL',
    score: 94,
    minYears: 0,
    maxYears: 1,
    positiveSignals: [
      { code: 'ENTRY_LEVEL_STATED', weight: 30, evidence: 'This is an entry level position.' },
      { code: 'GRADUATES_WELCOME', weight: 20, evidence: 'recent graduates are welcome to apply' },
    ],
    negativeSignals: [
      { code: 'ON_CALL_EXPECTED', weight: -10, evidence: 'occasional on-call rotation' },
    ],
    summary: 'States entry level explicitly and welcomes graduates.',
    classifiedAt: '2026-08-21T10:00:00.000Z',
  },
  sources: [
    {
      sourceKey: 'fixture-board',
      sourceName: 'Fixture Board',
      url: 'https://fixtures.juniorjob.local/board/1001',
      attributionText: 'Synthetic fixture data. Not a real posting.',
    },
    {
      sourceKey: 'fixture-feed',
      sourceName: 'Fixture Feed',
      url: 'https://fixtures.juniorjob.local/feed/2001',
      attributionText: null,
    },
  ],
  redirectedFromJobId: null,
};

function job(overrides: Partial<JobDetail> = {}): JobDetail {
  return { ...JOB, ...overrides };
}

let httpMock: HttpTestingController;

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      { provide: API_BASE_URL, useValue: BASE_URL },
      provideRouter([{ path: 'jobs/:id', component: JobDetailPage }]),
      // The application's own chain: the page renders `ApiError` messages, which
      // only exist because `errorInterceptor` produces them.
      provideHttpClient(withInterceptors([errorInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  httpMock = TestBed.inject(HttpTestingController);
});

afterEach(() => httpMock.verify());

function pendingDetail(id: string = JOB_ID): TestRequest {
  return httpMock.expectOne(`${BASE_URL}/jobs/${id}`);
}

/** See `search-page.spec.ts`: `whenStable()` would wait on the held-open request. */
async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function open(url = `/jobs/${JOB_ID}`) {
  const harness = await RouterTestingHarness.create(url);
  harness.detectChanges();

  const element = harness.routeNativeElement!;

  return {
    harness,
    element,
    text: () => element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    url: () => TestBed.inject(Router).url,
    detail: (id?: string) => pendingDetail(id),
    /**
     * Two turns, not one: the redirect is started by an effect that runs during
     * the first `detectChanges`, and the navigation it begins only resolves a
     * macrotask later. The second turn is a no-op for every other test.
     */
    async answer(request: TestRequest, response: JobDetail = job()) {
      request.flush(response);
      await tick();
      harness.detectChanges();
      await tick();
      harness.detectChanges();
    },
    async settle(response: JobDetail = job()) {
      return this.answer(pendingDetail(), response);
    },
    async fail(status: number, body: object) {
      pendingDetail().flush(body, { status, statusText: 'Error' });
      await tick();
      harness.detectChanges();
    },
    async click(label: string) {
      Array.from(element.querySelectorAll('button'))
        .find((node) => node.textContent?.trim() === label)!
        .click();
      await tick();
      harness.detectChanges();
    },
    links: () =>
      Array.from(element.querySelectorAll<HTMLAnchorElement>('.job-detail__source-link')),
  };
}

describe('JobDetailPage', () => {
  it('asks for the job named in the address', async () => {
    const view = await open();
    const request = view.detail();

    expect(request.request.method).toBe('GET');
    await view.answer(request);
  });

  it('says it is loading before the job arrives', async () => {
    const view = await open();

    expect(view.element.querySelector('app-spinner')).not.toBeNull();
    await view.settle();
    expect(view.element.querySelector('app-spinner')).toBeNull();
  });

  it('renders the title, the employer and the metadata', async () => {
    const view = await open();
    await view.settle();

    const text = view.text();
    expect(text).toContain('Junior Backend Developer (Java)');
    expect(text).toContain('Aurelia Systems Ltd');
    expect(text).toContain('Dublin');
    expect(text).toContain('0–1 years');
    expect(text).toContain('Hybrid');
    expect(text).toContain('Full time');
    expect(text).toContain('English');
  });

  it('renders the description as the paragraphs it was written as', async () => {
    const view = await open();
    await view.settle();

    const paragraphs = Array.from(
      view.element.querySelectorAll('.job-detail__description p'),
      (node) => node.textContent,
    );

    expect(paragraphs).toEqual([
      'Aurelia Systems is hiring a Junior Backend Developer.',
      'This is an entry level position.',
    ]);
  });

  it('marks the description with the posting’s own language', async () => {
    const view = await open();
    await view.settle(job({ language: 'de' }));

    expect(view.element.querySelector('.job-detail__description')!.getAttribute('lang')).toBe('de');
    expect(view.text()).toContain('German');
  });

  /**
   * The milestone's own verification: a seeded job renders its evidence — every
   * signal with the posting's own words underneath, on both sides.
   */
  it('renders the classification evidence, positive and negative', async () => {
    const view = await open();
    await view.settle();

    const text = view.text();
    expect(text).toContain('States entry level explicitly and welcomes graduates.');
    expect(text).toContain('Stated as an entry-level role');
    expect(text).toContain('This is an entry level position.');
    expect(text).toContain('Recent graduates welcome');
    expect(text).toContain('Potential concerns');
    expect(text).toContain('On-call duty expected');
    expect(text).toContain('occasional on-call rotation');
  });

  it('shows every signal rather than the card’s first three', async () => {
    const many = Array.from({ length: 5 }, (_, index) => ({
      code: `POSITIVE_${index}`,
      weight: 10,
      evidence: `excerpt ${index}`,
    }));
    const view = await open();
    await view.settle(
      job({
        classification: { ...JOB.classification!, positiveSignals: many, negativeSignals: [] },
      }),
    );

    expect(view.element.querySelectorAll('.signal-list__item')).toHaveLength(5);
  });

  /** §6.5: the number appears here precisely because the evidence does. */
  it('shows the score beside its evidence', async () => {
    const view = await open();
    await view.settle();

    const badge = view.element.querySelector('app-junior-score-badge')!;
    expect(badge.textContent).toContain('94');
    expect(badge.textContent).toContain('Entry level');
  });

  it('shows the band alone when the job has not been assessed', async () => {
    const view = await open();
    await view.settle(job({ classification: null, juniorLevel: null, juniorScore: null }));

    const badge = view.element.querySelector('app-junior-score-badge')!;
    expect(badge.textContent).toContain('Not yet assessed');
    expect(badge.textContent).not.toContain('94');
    expect(view.text()).toContain('has not been assessed yet');
  });

  it('shows the band alone when a classification carries no quotable evidence', async () => {
    const view = await open();
    await view.settle(
      job({ classification: { ...JOB.classification!, positiveSignals: [], negativeSignals: [] } }),
    );

    const badge = view.element.querySelector('app-junior-score-badge')!;
    expect(badge.textContent).not.toContain('94');
    expect(view.element.querySelector('app-signal-list')).toBeNull();
  });

  it('links out to every source, in a new tab, with its attribution', async () => {
    const view = await open();
    await view.settle();

    const links = view.links();
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://fixtures.juniorjob.local/board/1001',
      'https://fixtures.juniorjob.local/feed/2001',
    ]);
    expect(links.every((link) => link.target === '_blank')).toBe(true);
    expect(links.every((link) => link.rel === 'noopener noreferrer')).toBe(true);
    expect(view.text()).toContain('Also listed on 2 sources');
    expect(view.text()).toContain('Synthetic fixture data. Not a real posting.');
  });

  it('names a single source as the original posting rather than counting it', async () => {
    const view = await open();
    await view.settle(job({ sources: [JOB.sources[0]] }));

    expect(view.text()).toContain('Original posting');
    expect(view.text()).not.toContain('Also listed on');
  });

  it('says so when no source lists the posting any more', async () => {
    const view = await open();
    await view.settle(job({ isActive: false }));

    expect(view.element.querySelector('.job-detail__stale')).not.toBeNull();
  });

  /**
   * M7.4 merges duplicates and never rewrites the losing id. The backend resolves
   * it; the page corrects the address bar, so the link the reader copies out of it
   * is the one that will keep working.
   */
  it('replaces a merged-away id in the address with the job that was served', async () => {
    const staleId = '22222222-2222-2222-2222-222222222222';
    const view = await open(`/jobs/${staleId}`);

    await view.answer(view.detail(staleId), job({ redirectedFromJobId: staleId }));

    expect(view.url()).toBe(`/jobs/${JOB_ID}`);
    await view.answer(view.detail(JOB_ID));
    expect(view.text()).toContain('Junior Backend Developer (Java)');
  });

  it('does not navigate when the job served is the job asked for', async () => {
    const view = await open();
    await view.settle();

    expect(view.url()).toBe(`/jobs/${JOB_ID}`);
  });

  it('offers a way back when the job does not exist', async () => {
    const view = await open();
    await view.fail(404, { statusCode: 404, message: 'Job not found' });

    expect(view.text()).toContain('This job is not listed');
    expect(view.element.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows the server’s own words when the request fails, and retries it', async () => {
    const view = await open();
    await view.fail(500, { statusCode: 500, message: 'Something broke' });

    expect(view.element.querySelector('[role="alert"]')!.textContent).toContain('Something broke');

    await view.click('Try again');
    await view.settle();
    expect(view.text()).toContain('Junior Backend Developer (Java)');
  });
});
