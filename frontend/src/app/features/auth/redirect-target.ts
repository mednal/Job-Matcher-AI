/** Where a sign-in lands when nothing else was asked for. */
export const DEFAULT_REDIRECT = '/jobs';

/**
 * A path cannot contain a scheme, and control characters are how one is smuggled
 * past a naive check — a browser strips a leading tab or newline before it
 * resolves the URL, so `/\tjavascript:alert(1)` is not the path it looks like.
 */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Sanitizes the `redirectTo` the auth guard put in the query string.
 *
 * The value comes from the URL, so it is attacker-controlled: anyone can send a
 * link to `/auth/login?redirectTo=https://evil.example/login`, and a client that
 * navigated there after a successful sign-in would be an open redirect — the
 * user arrives at a convincing fake, having just proven the flow works.
 *
 * Only a path on this origin is accepted. Everything else falls back to the
 * default rather than failing, because a redirect that cannot be honoured is not
 * a reason to refuse a valid login.
 */
export function safeRedirectTarget(value: string | null | undefined): string {
  if (!value || !value.startsWith('/')) {
    return DEFAULT_REDIRECT;
  }

  // `//evil.example` and `/\evil.example` are protocol-relative URLs that a
  // browser resolves off-origin despite the leading slash.
  if (value.startsWith('//') || value.startsWith('/\\')) {
    return DEFAULT_REDIRECT;
  }

  if (value.includes('://') || hasControlCharacter(value)) {
    return DEFAULT_REDIRECT;
  }

  return value;
}
