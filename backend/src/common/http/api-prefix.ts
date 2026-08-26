// The global route prefix, set once in main.ts. It lives here because the
// throttler has to recognise an `/auth/*` request by its path (see
// ThrottlingModule) and must not import a feature module to do it.
export const API_PREFIX = 'api/v1';

// Every authentication route sits under this path and nothing else does.
export const AUTH_PATH_PREFIX = `/${API_PREFIX}/auth/`;
