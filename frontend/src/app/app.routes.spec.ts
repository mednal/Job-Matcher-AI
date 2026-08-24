import { Route, Routes } from '@angular/router';
import { routes } from './app.routes';
import { authRoutes } from './features/auth/auth.routes';

function isRedirect(route: Route): boolean {
  return route.redirectTo !== undefined;
}

describe('route table', () => {
  it('redirects the root path to the job search', () => {
    expect(routes[0]).toMatchObject({ path: '', pathMatch: 'full', redirectTo: 'jobs' });
  });

  it('loads every routed page lazily', () => {
    const eager = [...routes, ...authRoutes].filter(
      (route) => !isRedirect(route) && !route.loadComponent && !route.loadChildren,
    );

    expect(eager).toEqual([]);
  });

  it('resolves each lazy page to a component', async () => {
    for (const route of [...routes, ...authRoutes].filter((route) => route.loadComponent)) {
      expect(await route.loadComponent!()).toBeTruthy();
    }
  });

  it('ends with a catch-all so an unknown address is handled', () => {
    expect(routes[routes.length - 1].path).toBe('**');
  });
});
