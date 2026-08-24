import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth-service';

/**
 * Protects the routes that have no anonymous answer — saved jobs and the
 * profile. Search and job details are deliberately *not* guarded: the product is
 * meant to be evaluable before signup.
 *
 * A blocked navigation redirects to the login form carrying `redirectTo`, so
 * M11.4 can return the user to where they were going instead of dropping them on
 * the search page. Returning a `UrlTree` rather than calling `navigate()` keeps
 * it a single navigation, which is what leaves the browser history clean.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/auth/login'], {
    queryParams: { redirectTo: state.url },
  });
};
