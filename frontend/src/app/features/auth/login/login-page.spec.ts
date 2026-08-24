import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { API_BASE_URL } from '../../../core/api/api-base-url';
import { errorInterceptor } from '../../../core/interceptors/error-interceptor';
import { AuthService } from '../../../core/auth/auth-service';
import { LoginPage } from './login-page';

const BASE_URL = 'http://api.test/api/v1';
const TOKENS = { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 };

/**
 * The one navigation the page performs. It is stubbed in every case rather than
 * only where it is asserted: the test router has no route table, so a real
 * navigation to `/jobs` rejects asynchronously and surfaces as an unhandled
 * error in an unrelated test.
 */
let navigate: ReturnType<typeof vi.spyOn>;

function configure(queryParams: Record<string, string> = {}) {
  TestBed.configureTestingModule({
    imports: [LoginPage],
    providers: [
      { provide: API_BASE_URL, useValue: BASE_URL },
      provideRouter([]),
      // The same chain the application provides: the page is written against
      // `ApiError`, which only exists because `errorInterceptor` produces it.
      provideHttpClient(withInterceptors([errorInterceptor])),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
      },
    ],
  });

  navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
}

function render() {
  const fixture = TestBed.createComponent(LoginPage);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;

  return {
    fixture,
    element,
    field: (name: string) => element.querySelector<HTMLInputElement>(`#${name}`)!,
    type(name: string, value: string) {
      const input = this.field(name);
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    },
    submit() {
      element.querySelector('form')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
    },
    // The app is zoneless, so nothing re-renders on its own when a response
    // arrives. Every read of the DOM flushes the pending render first.
    errors() {
      fixture.detectChanges();
      return Array.from(element.querySelectorAll('.auth__error'), (node) =>
        node.textContent?.trim(),
      );
    },
    serverError() {
      fixture.detectChanges();
      return element.querySelector('.auth__server-error')?.textContent?.trim();
    },
    submitButton() {
      fixture.detectChanges();
      return element.querySelector('button[type="submit"]')!;
    },
  };
}

describe('LoginPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  describe('validation', () => {
    beforeEach(() => {
      configure();
      httpMock = TestBed.inject(HttpTestingController);
    });

    it('says nothing before the user has typed', () => {
      expect(render().errors()).toEqual([]);
    });

    // Submitting an untouched, empty form must not fail silently — without this
    // the button appears to do nothing at all.
    it('reports every empty field when the form is submitted blank', () => {
      const page = render();

      page.submit();

      expect(page.errors()).toEqual(['Email is required.', 'Password is required.']);
    });

    it('rejects an address that is not an email', () => {
      const page = render();

      page.type('email', 'not-an-email');
      page.field('email').dispatchEvent(new Event('blur'));
      page.submit();

      expect(page.errors()).toContain('Enter a valid email address.');
    });

    it('sends nothing to the API while the form is invalid', () => {
      const page = render();

      page.submit();

      // httpMock.verify() in afterEach fails if a request was made.
      expect(page.errors().length).toBeGreaterThan(0);
    });

    // The 10-character minimum is a registration rule. Enforcing it here would
    // refuse to even try an older account's password.
    it('accepts a short password, which only the API can judge', () => {
      const page = render();

      page.type('email', 'ada@example.com');
      page.type('password', 'short');
      page.submit();

      httpMock.expectOne(`${BASE_URL}/auth/login`).flush(TOKENS);

      expect(page.errors()).toEqual([]);
    });

    it('marks an invalid field for assistive technology', () => {
      const page = render();

      page.submit();

      expect(page.field('email').getAttribute('aria-invalid')).toBe('true');
      expect(page.field('email').getAttribute('aria-describedby')).toBe('email-error');
    });
  });

  describe('submission', () => {
    beforeEach(() => {
      configure();
      httpMock = TestBed.inject(HttpTestingController);
    });

    function signIn(page: ReturnType<typeof render>) {
      page.type('email', 'ada@example.com');
      page.type('password', 'a-long-password');
      page.submit();
    }

    it('signs in and lands on the search page by default', () => {
      const page = render();

      signIn(page);

      const request = httpMock.expectOne(`${BASE_URL}/auth/login`);
      expect(request.request.body).toEqual({
        email: 'ada@example.com',
        password: 'a-long-password',
      });
      request.flush(TOKENS);

      expect(TestBed.inject(AuthService).isAuthenticated()).toBe(true);
      expect(navigate).toHaveBeenCalledWith('/jobs');
    });

    // The server's wording is shown as-is: one message for both "unknown email"
    // and "wrong password", so the form cannot be used to find real accounts.
    it('shows the server message when the credentials are refused', () => {
      const page = render();

      signIn(page);

      httpMock
        .expectOne(`${BASE_URL}/auth/login`)
        .flush(
          { statusCode: 401, message: 'Invalid email or password' },
          { status: 401, statusText: 'Unauthorized' },
        );

      expect(page.serverError()).toBe('Invalid email or password');
      expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
    });

    it('re-enables the button after a failure so the user can try again', () => {
      const page = render();

      signIn(page);
      expect(page.submitButton().hasAttribute('disabled')).toBe(true);

      httpMock
        .expectOne(`${BASE_URL}/auth/login`)
        .flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(page.submitButton().hasAttribute('disabled')).toBe(false);
    });

    it('does not submit twice while a sign-in is in flight', () => {
      const page = render();

      signIn(page);
      page.submit();

      // A second /auth/login request would fail this expectation.
      httpMock.expectOne(`${BASE_URL}/auth/login`).flush(TOKENS);
    });
  });

  describe('redirect after login', () => {
    it('returns the user to the page the guard stopped them on', () => {
      configure({ redirectTo: '/saved' });
      httpMock = TestBed.inject(HttpTestingController);
      const page = render();

      page.type('email', 'ada@example.com');
      page.type('password', 'a-long-password');
      page.submit();
      httpMock.expectOne(`${BASE_URL}/auth/login`).flush(TOKENS);

      expect(navigate).toHaveBeenCalledWith('/saved');
    });

    it('ignores an off-site redirect rather than honouring it', () => {
      configure({ redirectTo: 'https://evil.example' });
      httpMock = TestBed.inject(HttpTestingController);
      const page = render();

      page.type('email', 'ada@example.com');
      page.type('password', 'a-long-password');
      page.submit();
      httpMock.expectOne(`${BASE_URL}/auth/login`).flush(TOKENS);

      expect(navigate).toHaveBeenCalledWith('/jobs');
    });
  });
});
