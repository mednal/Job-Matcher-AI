import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth-service';
import { ApiError } from '../../../core/models/api-error';
import { MAX_EMAIL_LENGTH, MAX_PASSWORD_LENGTH } from '../../../core/models/auth';
import { Button } from '../../../shared/ui/button';
import { InputField } from '../../../shared/ui/input';
import { fieldError } from '../../../shared/field-errors';
import { safeRedirectTarget } from '../redirect-target';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, Button, InputField],
  templateUrl: './login-page.html',
  styleUrl: '../auth-form.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /**
   * Where the auth guard was headed when it stopped the navigation. Read once,
   * at construction, so a later query-param change cannot move the target out
   * from under a submission that is already in flight.
   */
  protected readonly redirectTo = safeRedirectTarget(
    this.route.snapshot.queryParamMap.get('redirectTo'),
  );

  protected readonly submitting = signal(false);
  protected readonly serverErrors = signal<string[]>([]);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(MAX_EMAIL_LENGTH)]],
    /**
     * Required, and nothing more. The 10-character minimum belongs on
     * *registration*: applying it here would refuse to even attempt a login for
     * an account whose password predates the rule, and it would tell an attacker
     * the password's shape before they have sent one.
     */
    password: ['', [Validators.required, Validators.maxLength(MAX_PASSWORD_LENGTH)]],
  });

  protected errorFor(field: 'email' | 'password', label: string): string | null {
    return fieldError(this.form.get(field), label);
  }

  protected submit(): void {
    if (this.submitting()) {
      return;
    }

    // A form submitted while invalid has fields the user has never touched, and
    // `fieldError` stays quiet on those. Marking them touched is what turns the
    // silent refusal into a list of what is actually wrong.
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.serverErrors.set([]);

    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => {
        void this.router.navigateByUrl(this.redirectTo);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.serverErrors.set(messagesFor(error));
      },
    });
  }
}

/**
 * The server's own wording is shown as-is. For a failed login that is
 * deliberately "Invalid email or password" — one message for both causes, so the
 * form cannot be used to find out which addresses have accounts.
 */
function messagesFor(error: unknown): string[] {
  if (error instanceof ApiError) {
    return error.messages;
  }
  return ['Something went wrong. Please try again.'];
}
