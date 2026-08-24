import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { API_BASE_URL } from '../../../core/api/api-base-url';
import { errorInterceptor } from '../../../core/interceptors/error-interceptor';
import { AuthService } from '../../../core/auth/auth-service';
import { RegisterPage } from './register-page';

const BASE_URL = 'http://api.test/api/v1';
const TOKENS = { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 };

/**
 * Stubbed in every case, not only where it is asserted: the test router has no
 * route table, so a real navigation rejects asynchronously and surfaces as an
 * unhandled error in whichever test happens to be running.
 */
let navigate: ReturnType<typeof vi.spyOn>;

function configure(queryParams: Record<string, string> = {}) {
  TestBed.configureTestingModule({
    imports: [RegisterPage],
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
  const fixture = TestBed.createComponent(RegisterPage);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;

  return {
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
    serverErrors() {
      fixture.detectChanges();
      return Array.from(element.querySelectorAll('.auth__server-error li'), (node) =>
        node.textContent?.trim(),
      );
    },
    serverError() {
      fixture.detectChanges();
      return element.querySelector('.auth__server-error')?.textContent?.trim();
    },
  };
}

describe('RegisterPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    configure();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  describe('validation', () => {
    it('reports the empty fields when the form is submitted blank', () => {
      const page = render();

      page.submit();

      expect(page.errors()).toEqual(['Email is required.', 'Password is required.']);
    });

    // Mirrors RegisterDto: a password the API would reject is caught here, where
    // the user can see which rule they broke.
    it('rejects a password shorter than the API accepts', () => {
      const page = render();

      page.type('email', 'ada@example.com');
      page.type('password', 'too-short');
      page.submit();

      expect(page.errors()).toEqual(['Password must be at least 10 characters.']);
    });

    it('states the password rule before the user types it', () => {
      expect(render().element.querySelector('#password-hint')?.textContent).toContain(
        'At least 10 characters',
      );
    });
  });

  describe('submission', () => {
    function signUp(page: ReturnType<typeof render>) {
      page.type('email', 'ada@example.com');
      page.type('password', 'a-long-password');
      page.submit();
    }

    // Registration returns tokens, so the account is signed in on the spot;
    // sending someone straight back to a login form would be a step for nothing.
    it('signs the new account in and leaves the auth screens', () => {
      const page = render();

      signUp(page);

      const request = httpMock.expectOne(`${BASE_URL}/auth/register`);
      expect(request.request.body).toEqual({
        email: 'ada@example.com',
        password: 'a-long-password',
      });
      request.flush(TOKENS);

      expect(TestBed.inject(AuthService).isAuthenticated()).toBe(true);
      expect(navigate).toHaveBeenCalledWith('/jobs');
    });

    it('shows the server message when the email is already registered', () => {
      const page = render();

      signUp(page);

      httpMock
        .expectOne(`${BASE_URL}/auth/register`)
        .flush(
          { statusCode: 409, message: 'Email already registered' },
          { status: 409, statusText: 'Conflict' },
        );

      expect(page.serverError()).toBe('Email already registered');
      expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
    });

    // A validation failure returns one message per broken rule, and a form that
    // showed only the first would send the user round the loop twice.
    it('lists every message a validation failure returns', () => {
      const page = render();

      signUp(page);

      httpMock.expectOne(`${BASE_URL}/auth/register`).flush(
        {
          statusCode: 400,
          message: ['email must be an email', 'password is too weak'],
        },
        { status: 400, statusText: 'Bad Request' },
      );

      expect(page.serverErrors()).toEqual(['email must be an email', 'password is too weak']);
    });
  });

  it('carries the redirect target through to the account it creates', () => {
    TestBed.resetTestingModule();
    configure({ redirectTo: '/profile' });
    httpMock = TestBed.inject(HttpTestingController);
    const page = render();

    page.type('email', 'ada@example.com');
    page.type('password', 'a-long-password');
    page.submit();
    httpMock.expectOne(`${BASE_URL}/auth/register`).flush(TOKENS);

    expect(navigate).toHaveBeenCalledWith('/profile');
  });
});
