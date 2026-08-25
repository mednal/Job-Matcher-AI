import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth-service';
import { ApiError } from '../../../core/models/api-error';
import {
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from '../../../core/models/auth';
import { Button } from '../../../shared/ui/button';
import { InputField } from '../../../shared/ui/input';
import { fieldError } from '../../../shared/field-errors';
import { safeRedirectTarget } from '../redirect-target';

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink, Button, InputField],
  templateUrl: './register-page.html',
  styleUrl: '../auth-form.scss',
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly redirectTo = safeRedirectTarget(
    this.route.snapshot.queryParamMap.get('redirectTo'),
  );

  protected readonly minPasswordLength = MIN_PASSWORD_LENGTH;
  protected readonly submitting = signal(false);
  protected readonly serverErrors = signal<string[]>([]);

  /**
   * The rules are the backend's, mirrored — `RegisterDto` enforces exactly these
   * bounds. Validating looser here would turn a fixable field into a 400 the
   * user has to decode; validating stricter would refuse a password the API
   * would have accepted.
   */
  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(MAX_EMAIL_LENGTH)]],
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(MIN_PASSWORD_LENGTH),
        Validators.maxLength(MAX_PASSWORD_LENGTH),
      ],
    ],
  });

  protected errorFor(field: 'email' | 'password', label: string): string | null {
    return fieldError(this.form.get(field), label);
  }

  protected submit(): void {
    if (this.submitting()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.serverErrors.set([]);

    // Registration returns the same token pair a login does, so the new account
    // is signed in on the spot. Sending someone who just proved their password
    // to a login form to type it again would be a step that exists for no reason.
    this.auth.register(this.form.getRawValue()).subscribe({
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
 * A validation failure returns one message per broken rule and all of them are
 * shown; a taken email returns the single "Email already registered", which is
 * not an account-enumeration leak the way it would be on login — registration
 * cannot avoid telling the caller that an address is in use.
 */
function messagesFor(error: unknown): string[] {
  if (error instanceof ApiError) {
    return error.messages;
  }
  return ['Something went wrong. Please try again.'];
}
