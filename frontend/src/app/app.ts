import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth-service';

interface NavLink {
  readonly path: string;
  readonly label: string;
}

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly navLinks: readonly NavLink[] = [
    { path: '/jobs', label: 'Search' },
    { path: '/saved', label: 'Saved jobs' },
    { path: '/profile', label: 'Profile' },
  ];

  protected readonly isAuthenticated = this.auth.isAuthenticated;
  protected readonly user = this.auth.user;

  constructor() {
    // A reload restores the tokens but not who they belong to, so the header
    // would show a signed-in state with no name against it. This is the only
    // request the shell makes; `loadCurrentUser` answers immediately with `null`
    // when there is no session, so an anonymous visitor causes no traffic.
    if (this.auth.isAuthenticated() && !this.auth.user()) {
      this.auth.loadCurrentUser().subscribe({
        // A failure here costs the header an email address and nothing else.
        // The interceptor has already dealt with an expired token, and taking
        // the whole shell down over a decoration would be worse than the gap.
        error: () => undefined,
      });
    }
  }

  protected logout(): void {
    this.auth.logout().subscribe({
      // `logout()` clears the session locally whatever the server answers, so
      // both paths end the same way: back on the public search page, which is
      // the one screen that is always available.
      complete: () => void this.router.navigateByUrl('/jobs'),
    });
  }
}
