import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * The API root every client prefixes its paths with, e.g.
 * `http://localhost:3000/api/v1`.
 *
 * An injection token rather than a direct `environment` import in each client:
 * a test can point the clients at a fixed base without touching the build
 * configuration, and there is one place to change if the API moves.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiBaseUrl,
});
