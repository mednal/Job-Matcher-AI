import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth-guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'jobs' },
  {
    path: 'jobs',
    title: 'Search jobs — JuniorJob AI',
    loadComponent: () => import('./features/search/search-page').then((m) => m.SearchPage),
  },
  {
    path: 'jobs/:id',
    title: 'Job details — JuniorJob AI',
    loadComponent: () =>
      import('./features/job-detail/job-detail-page').then((m) => m.JobDetailPage),
  },
  {
    path: 'saved',
    title: 'Saved jobs — JuniorJob AI',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/saved-jobs/saved-jobs-page').then((m) => m.SavedJobsPage),
  },
  {
    path: 'profile',
    title: 'Profile — JuniorJob AI',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
  },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.authRoutes),
  },
  {
    path: '**',
    title: 'Page not found — JuniorJob AI',
    loadComponent: () => import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
  },
];
