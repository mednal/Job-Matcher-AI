import { Injectable, signal } from '@angular/core';
import { AuthTokens } from '../models/auth';

const ACCESS_TOKEN_KEY = 'juniorjob.accessToken';
const REFRESH_TOKEN_KEY = 'juniorjob.refreshToken';

/**
 * Where the tokens live between page loads.
 *
 * `localStorage` is the deliberate MVP choice: the backend hands the tokens to
 * the client in a JSON body rather than setting a cookie, so a JS-readable store
 * is the only option that survives a reload, and a session that ends on every
 * refresh of the page is not a usable product. The exposure this accepts is XSS
 * — which the Angular template compiler's escaping is the actual defence
 * against. Moving to httpOnly cookies is a backend decision (`/auth/*` would
 * have to set them), not something this class can make alone.
 *
 * Every access is wrapped: `localStorage` *throws* rather than returning null in
 * a browser with site data blocked, and an app that cannot start because storage
 * is disabled would be broken for a reason the user cannot see. Without storage
 * the session simply does not survive a reload.
 */
@Injectable({ providedIn: 'root' })
export class TokenStorage {
  /**
   * Signals, so `AuthService.isAuthenticated` recomputes the moment tokens
   * change and every template watching it re-renders — no event bus, no manual
   * notification.
   */
  readonly accessToken = signal<string | null>(read(ACCESS_TOKEN_KEY));
  readonly refreshToken = signal<string | null>(read(REFRESH_TOKEN_KEY));

  set(tokens: AuthTokens): void {
    this.accessToken.set(tokens.accessToken);
    this.refreshToken.set(tokens.refreshToken);
    write(ACCESS_TOKEN_KEY, tokens.accessToken);
    write(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }

  clear(): void {
    this.accessToken.set(null);
    this.refreshToken.set(null);
    remove(ACCESS_TOKEN_KEY);
    remove(REFRESH_TOKEN_KEY);
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable or full — the in-memory signals still hold the
    // session for this tab, which is the most that can be honoured here.
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to do: the signals are already cleared, so this tab is logged out.
  }
}
