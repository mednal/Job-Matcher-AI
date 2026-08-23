import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key read by JwtAuthGuard (modules/auth) to make authentication
 * *optional* on a route rather than absent.
 *
 * `@Public()` cannot express this: it short-circuits the guard, so no user is
 * attached even when the caller sent a valid token. `docs/ARCHITECTURE.md` §8
 * marks `/jobs/search` and `/jobs/:id` "opt." — readable without auth so the
 * product is evaluable before signup, but personalized for a caller we can
 * identify (§6.5). That is what this decorator is for.
 *
 * A token that is present but invalid or expired is still rejected. Ignoring it
 * would silently downgrade the request to anonymous — the user would get
 * unpersonalized results with a 200, and the client would never learn it needs to
 * refresh.
 */
export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';

export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
