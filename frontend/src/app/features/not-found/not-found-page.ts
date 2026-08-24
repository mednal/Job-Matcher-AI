import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  template: `
    <section class="page">
      <h1>Page not found</h1>
      <p class="page__note">That address does not match anything in the application.</p>
      <a routerLink="/jobs">Back to job search</a>
    </section>
  `,
})
export class NotFoundPage {}
