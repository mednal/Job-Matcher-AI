import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL } from './core/api/api-base-url';
import { TokenStorage } from './core/auth/token-storage';
import { App } from './app';

const BASE_URL = 'http://api.test/api/v1';

describe('App shell', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: API_BASE_URL, useValue: BASE_URL },
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function signIn(): void {
    TestBed.inject(TokenStorage).set({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 900,
    });
  }

  it('names the product in the header', () => {
    expect(render().querySelector('.brand__name')?.textContent).toContain('JuniorJob AI');
  });

  it('links to every primary destination', () => {
    const hrefs = Array.from(render().querySelectorAll('nav[aria-label="Primary"] a'), (link) =>
      link.getAttribute('href'),
    );

    expect(hrefs).toEqual(['/jobs', '/saved', '/profile']);
  });

  it('renders a router outlet for the routed page', () => {
    expect(render().querySelector('router-outlet')).not.toBeNull();
  });

  it('states that the score is not a hiring prediction', () => {
    expect(render().querySelector('.app-footer__note')?.textContent).toContain(
      'not a prediction of getting hired',
    );
  });

  describe('account area', () => {
    it('offers the auth screens to a visitor with no session', () => {
      const hrefs = Array.from(render().querySelectorAll('.app-account a'), (link) =>
        link.getAttribute('href'),
      );

      expect(hrefs).toEqual(['/auth/login', '/auth/register']);
    });

    it('makes no request at all when nobody is signed in', () => {
      render();

      // httpMock.verify() enforces it: an anonymous visitor costs no traffic.
      expect(true).toBe(true);
    });

    // Without this there is no way out of a session, and the header would still
    // invite a signed-in user to log in.
    it('replaces the auth links with a log-out control once signed in', () => {
      signIn();

      const element = render();
      httpMock.expectOne(`${BASE_URL}/users/me`).flush({
        id: 'user-1',
        email: 'ada@example.com',
        role: 'USER',
        createdAt: '2026-08-01T10:00:00.000Z',
      });

      expect(element.querySelector('.app-account a')).toBeNull();
      expect(element.querySelector('.app-account button')?.textContent).toContain('Log out');
    });

    // A reload restores the tokens but not who they belong to.
    it('names the signed-in account after loading it', () => {
      signIn();

      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      httpMock.expectOne(`${BASE_URL}/users/me`).flush({
        id: 'user-1',
        email: 'ada@example.com',
        role: 'USER',
        createdAt: '2026-08-01T10:00:00.000Z',
      });
      fixture.detectChanges();

      expect(
        (fixture.nativeElement as HTMLElement).querySelector('.app-account__email')?.textContent,
      ).toContain('ada@example.com');
    });

    // Losing the email is not a reason to take the whole shell down.
    it('still renders when the account cannot be loaded', () => {
      signIn();

      const element = render();
      httpMock
        .expectOne(`${BASE_URL}/users/me`)
        .flush(null, { status: 500, statusText: 'Server Error' });

      expect(element.querySelector('.app-account button')).not.toBeNull();
    });
  });
});
