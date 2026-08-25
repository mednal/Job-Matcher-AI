import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../../core/api/api-base-url';
import { AuthTokens } from '../../core/models/auth';
import { TokenStorage } from '../../core/auth/token-storage';
import { SaveToggle } from './save-toggle';

const BASE_URL = 'http://api.test/api/v1';
const TOKENS: AuthTokens = { accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 900 };

let storage: TokenStorage;
let httpMock: HttpTestingController;

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function render(jobId = 'job-1') {
  const fixture = TestBed.createComponent(SaveToggle);
  fixture.componentRef.setInput('jobId', jobId);
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    element,
    button: () => element.querySelector<HTMLButtonElement>('button'),
    error: () => element.querySelector('.save-toggle__error')?.textContent?.trim() ?? null,
    async click() {
      element.querySelector<HTMLButtonElement>('button')!.click();
      await tick();
      fixture.detectChanges();
    },
  };
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

describe('SaveToggle', () => {
  it('renders nothing for a signed-out visitor', () => {
    const view = render();
    expect(view.button()).toBeNull();
  });

  it('offers "Save" for a job the store does not know is saved', async () => {
    storage.set(TOKENS);
    const view = render();

    // `ensureLoaded()` fires in the constructor; answer it so the assertion
    // reflects the settled state, not the loading gap.
    httpMock
      .expectOne((request) => request.method === 'GET')
      .flush({
        items: [],
        page: 1,
        pageSize: 50,
        total: 0,
      });
    await tick();
    view.fixture.detectChanges();

    expect(view.button()!.textContent?.trim()).toBe('Save');
    expect(view.button()!.getAttribute('aria-pressed')).toBe('false');
  });

  it('offers "Saved" once the background load says the job is already saved', async () => {
    storage.set(TOKENS);
    const view = render();

    httpMock
      .expectOne((request) => request.method === 'GET')
      .flush({
        items: [{ jobId: 'job-1' }],
        page: 1,
        pageSize: 50,
        total: 1,
      });
    await tick();
    view.fixture.detectChanges();

    expect(view.button()!.textContent?.trim()).toBe('Saved');
    expect(view.button()!.getAttribute('aria-pressed')).toBe('true');
  });

  it('saves optimistically, before the request settles', async () => {
    storage.set(TOKENS);
    const view = render();
    httpMock
      .expectOne((request) => request.method === 'GET')
      .flush({
        items: [],
        page: 1,
        pageSize: 50,
        total: 0,
      });

    view.element.querySelector<HTMLButtonElement>('button')!.click();
    view.fixture.detectChanges();

    expect(view.button()!.textContent?.trim()).toBe('Saved');
    expect(view.button()!.disabled).toBe(true);

    httpMock.expectOne(`${BASE_URL}/saved-jobs`).flush(null);
    await tick();
    view.fixture.detectChanges();
    expect(view.button()!.disabled).toBe(false);
  });

  it('rolls back and reports the failure when saving fails', async () => {
    storage.set(TOKENS);
    const view = render();
    httpMock
      .expectOne((request) => request.method === 'GET')
      .flush({
        items: [],
        page: 1,
        pageSize: 50,
        total: 0,
      });

    await view.click();
    httpMock.expectOne(`${BASE_URL}/saved-jobs`).flush(null, { status: 500, statusText: 'Error' });
    await tick();
    view.fixture.detectChanges();

    expect(view.button()!.textContent?.trim()).toBe('Save');
    expect(view.error()).toContain('Could not save');
  });

  it('unsaves an already-saved job', async () => {
    storage.set(TOKENS);
    const view = render();
    httpMock
      .expectOne((request) => request.method === 'GET')
      .flush({
        items: [{ jobId: 'job-1' }],
        page: 1,
        pageSize: 50,
        total: 1,
      });

    await view.click();
    expect(view.button()!.textContent?.trim()).toBe('Save');

    httpMock.expectOne(`${BASE_URL}/saved-jobs/job-1`).flush(null);
  });

  it('rolls back and reports the failure when unsaving fails', async () => {
    storage.set(TOKENS);
    const view = render();
    httpMock
      .expectOne((request) => request.method === 'GET')
      .flush({
        items: [{ jobId: 'job-1' }],
        page: 1,
        pageSize: 50,
        total: 1,
      });

    await view.click();
    httpMock
      .expectOne(`${BASE_URL}/saved-jobs/job-1`)
      .flush(null, { status: 500, statusText: 'Error' });
    await tick();
    view.fixture.detectChanges();

    expect(view.button()!.textContent?.trim()).toBe('Saved');
    expect(view.error()).toContain('Could not unsave');
  });
});
