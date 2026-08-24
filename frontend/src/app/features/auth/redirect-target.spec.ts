import { DEFAULT_REDIRECT, safeRedirectTarget } from './redirect-target';

describe('safeRedirectTarget', () => {
  it('keeps a path on this origin, query string and all', () => {
    expect(safeRedirectTarget('/saved')).toBe('/saved');
    expect(safeRedirectTarget('/jobs?q=angular&juniorLevel=ENTRY_LEVEL')).toBe(
      '/jobs?q=angular&juniorLevel=ENTRY_LEVEL',
    );
  });

  it('falls back to the search page when nothing was asked for', () => {
    expect(safeRedirectTarget(null)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectTarget(undefined)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectTarget('')).toBe(DEFAULT_REDIRECT);
  });

  // The whole point of the function: `redirectTo` comes from the URL, so anyone
  // can put an off-site address in it and have the app send a freshly signed-in
  // user there.
  it('refuses to send the user off this origin', () => {
    expect(safeRedirectTarget('https://evil.example/login')).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectTarget('//evil.example')).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectTarget('/\\evil.example')).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectTarget('javascript:alert(1)')).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectTarget('/redirect?to=https://evil.example')).toBe(DEFAULT_REDIRECT);
  });

  it('refuses a path carrying control characters, which browsers strip', () => {
    expect(safeRedirectTarget('/\tjavascript:alert(1)')).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectTarget('/jobs\n')).toBe(DEFAULT_REDIRECT);
  });
});
