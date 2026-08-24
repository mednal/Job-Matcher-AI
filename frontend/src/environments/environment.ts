import { Environment } from './environment.model';

/**
 * Build-time configuration, replaced by `environment.development.ts` in the
 * development build (see `angular.json` → `fileReplacements`).
 *
 * A browser bundle has no process environment, so this is the SPA equivalent of
 * the backend's `.env`. Nothing secret belongs here: everything in this file is
 * shipped to the browser in plain text.
 */
export const environment: Environment = {
  production: true,
  /**
   * Same-origin by default, so a deployment that serves the SPA behind the same
   * host as the API needs no override.
   */
  apiBaseUrl: '/api/v1',
};
