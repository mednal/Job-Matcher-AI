import { AbstractControl } from '@angular/forms';

/**
 * The one message to show under a field, or `null` when the field has nothing to
 * say yet.
 *
 * Only *one* message is returned even when several validators failed: a field
 * that reports "is required" and "must be at least 10 characters" at once reads
 * as noise, and the first unmet rule is the one the user has to fix first.
 *
 * Nothing is shown until the control has been touched or edited. A form that
 * greets the user with three errors before they have typed anything is telling
 * them off for not having started.
 */
export function fieldError(control: AbstractControl | null, label: string): string | null {
  if (!control || control.valid || (control.untouched && control.pristine)) {
    return null;
  }

  const errors = control.errors;
  if (!errors) {
    return null;
  }

  if (errors['required']) {
    return `${label} is required.`;
  }
  if (errors['email']) {
    return 'Enter a valid email address.';
  }
  if (errors['minlength']) {
    const required = (errors['minlength'] as { requiredLength: number }).requiredLength;
    return `${label} must be at least ${required} characters.`;
  }
  if (errors['maxlength']) {
    const allowed = (errors['maxlength'] as { requiredLength: number }).requiredLength;
    return `${label} must be at most ${allowed} characters.`;
  }
  if (errors['min']) {
    const min = (errors['min'] as { min: number }).min;
    return `${label} must be at least ${min}.`;
  }
  if (errors['max']) {
    const max = (errors['max'] as { max: number }).max;
    return `${label} must be at most ${max}.`;
  }

  // A validator nobody wrote a message for. Saying something generic beats
  // showing a valid-looking field that refuses to submit.
  return `${label} is not valid.`;
}
