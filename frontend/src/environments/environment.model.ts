/**
 * The shape both environment files must satisfy. It lives in its own file
 * because the build *replaces* `environment.ts` with `environment.development.ts`
 * — a type imported from either one would disappear in the configuration where
 * that file is the one swapped out.
 */
export interface Environment {
  readonly production: boolean;
  /** API root including the backend's `api/v1` global prefix, no trailing slash. */
  readonly apiBaseUrl: string;
}
