import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL } from '../../core/api/api-base-url';
import { errorInterceptor } from '../../core/interceptors/error-interceptor';
import { Profile } from '../../core/models/profile';
import { ProfilePage } from './profile-page';

const BASE_URL = 'http://api.test/api/v1';

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    displayName: 'Alex',
    yearsOfExperience: 1,
    desiredRoles: ['Junior Java Developer'],
    technologies: ['java'],
    locations: ['Berlin, Germany'],
    countryCodes: ['DE'],
    workplaceTypes: ['HYBRID'],
    updatedAt: '2026-08-24T09:00:00.000Z',
    ...overrides,
  };
}

let httpMock: HttpTestingController;

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      { provide: API_BASE_URL, useValue: BASE_URL },
      provideRouter([]),
      // The same chain the application provides: the page renders `ApiError`
      // messages, which only exist because `errorInterceptor` produces them.
      provideHttpClient(withInterceptors([errorInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  httpMock = TestBed.inject(HttpTestingController);
});

afterEach(() => httpMock.verify());

function render() {
  const fixture = TestBed.createComponent(ProfilePage);
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  const buttonNamed = (label: string) =>
    Array.from(element.querySelectorAll('button')).find(
      (node) => node.textContent?.trim() === label,
    )!;

  return {
    fixture,
    element,
    text: () => element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    input: (id: string) => element.querySelector<HTMLInputElement>(`#${id}`)!,
    /** Every chip in one multi-value or country field, by the field's input id. */
    chipsOf: (id: string) => {
      const field = element
        .querySelector<HTMLInputElement>(`#${id}`)!
        .closest('app-multi-value-field, app-country-field')!;
      return Array.from(field.querySelectorAll('app-chip'), (node) =>
        node.textContent?.replace(/\s+/g, ' ').replace('×', '').trim(),
      );
    },
    type(id: string, value: string) {
      const field = element.querySelector<HTMLInputElement>(`#${id}`)!;
      field.value = value;
      field.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    },
    /**
     * Enter, not the "Add" button: every multi-value field on the page has one of
     * those, and finding it by label would always hit the first field.
     */
    commit(id: string) {
      element
        .querySelector<HTMLInputElement>(`#${id}`)!
        .dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true }),
        );
      fixture.detectChanges();
    },
    click(label: string) {
      buttonNamed(label).click();
      fixture.detectChanges();
    },
    save() {
      element.querySelector('form')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
    },
    removeChip(value: string, label: string) {
      element
        .querySelector<HTMLButtonElement>(`[aria-label="Remove ${value} from ${label}"]`)!
        .click();
      fixture.detectChanges();
    },
    /** Answers the load `GET /profiles/me` and lets the form settle. */
    async load(body: Profile) {
      httpMock.expectOne(`${BASE_URL}/profiles/me`).flush(body);
      await tick();
      fixture.detectChanges();
    },
    async failLoad() {
      httpMock
        .expectOne(`${BASE_URL}/profiles/me`)
        .flush({ message: 'Boom' }, { status: 500, statusText: 'Server Error' });
      await tick();
      fixture.detectChanges();
    },
    pendingSave: () =>
      httpMock.expectOne(
        (request) => request.url === `${BASE_URL}/profiles/me` && request.method === 'PUT',
      ),
  };
}

describe('ProfilePage', () => {
  it('fills the form from the saved profile', async () => {
    const page = render();
    await page.load(profile());

    expect(page.input('profile-display-name').value).toBe('Alex');
    expect(page.input('profile-years').value).toBe('1');
    expect(page.chipsOf('profile-technologies')).toEqual(['java']);
    expect(page.chipsOf('profile-country-codes')).toEqual(['Germany']);
    expect(page.element.querySelector<HTMLInputElement>('.profile__choice input')).toBeTruthy();
  });

  it('sends every field it owns, so an emptied list is actually emptied', async () => {
    const page = render();
    await page.load(profile());

    page.removeChip('java', 'Technologies');
    page.save();

    const request = page.pendingSave();
    expect(request.request.body).toEqual({
      displayName: 'Alex',
      yearsOfExperience: 1,
      desiredRoles: ['Junior Java Developer'],
      technologies: [],
      locations: ['Berlin, Germany'],
      countryCodes: ['DE'],
      workplaceTypes: ['HYBRID'],
    });

    request.flush(profile({ technologies: [] }));
    await tick();
  });

  it('omits a blank display name, which is how the server clears it', async () => {
    const page = render();
    await page.load(profile());

    page.type('profile-display-name', '   ');
    page.save();

    const request = page.pendingSave();
    expect(request.request.body).not.toHaveProperty('displayName');

    request.flush(profile({ displayName: null }));
    await tick();
  });

  it('redraws from what was stored, not from what was typed', async () => {
    const page = render();
    await page.load(profile({ technologies: [] }));

    page.type('profile-technologies', 'Spring Boot');
    page.commit('profile-technologies');
    page.save();

    // The server slugifies as it writes; the field then shows the vocabulary the
    // search actually matches against.
    page.pendingSave().flush(profile({ technologies: ['spring-boot'] }));
    await tick();
    page.fixture.detectChanges();

    expect(page.chipsOf('profile-technologies')).toEqual(['spring-boot']);
    expect(page.text()).toContain('Profile saved.');
  });

  it("shows the server's own words when a value is rejected", async () => {
    const page = render();
    await page.load(profile());

    page.save();
    page
      .pendingSave()
      .flush(
        { message: ['each value in countryCodes must be a valid ISO31661 Alpha2 code'] },
        { status: 400, statusText: 'Bad Request' },
      );
    await tick();
    page.fixture.detectChanges();

    expect(page.text()).toContain('must be a valid ISO31661 Alpha2 code');
    expect(page.text()).not.toContain('Profile saved.');
  });

  it('offers a retry when the profile cannot be loaded at all', async () => {
    const page = render();
    await page.failLoad();

    expect(page.text()).toContain('Your profile could not be loaded.');

    page.click('Try again');
    await page.load(profile());

    expect(page.input('profile-display-name').value).toBe('Alex');
  });

  it('says so when nothing has been saved yet', async () => {
    const page = render();
    await page.load(
      profile({
        displayName: null,
        yearsOfExperience: 0,
        desiredRoles: [],
        technologies: [],
        locations: [],
        countryCodes: [],
        workplaceTypes: [],
        updatedAt: null,
      }),
    );

    expect(page.text()).toContain('Nothing saved yet.');
  });
});
