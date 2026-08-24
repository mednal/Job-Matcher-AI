import { Routes } from '@angular/router';

export const authRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    title: 'Log in — JuniorJob AI',
    loadComponent: () => import('./login/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    title: 'Create account — JuniorJob AI',
    loadComponent: () => import('./register/register-page').then((m) => m.RegisterPage),
  },
];
