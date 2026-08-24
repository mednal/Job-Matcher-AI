import { HttpErrorResponse } from '@angular/common/http';
import { toApiError } from './api-error';

function httpError(body: unknown, status: number, statusText = 'Error'): HttpErrorResponse {
  return new HttpErrorResponse({
    error: body,
    status,
    statusText,
    url: 'http://api.test/api/v1/profiles/me',
  });
}

describe('toApiError', () => {
  it('reads the single message a thrown NestJS exception returns', () => {
    const error = toApiError(httpError({ statusCode: 404, message: 'Job not found' }, 404));

    expect(error.status).toBe(404);
    expect(error.messages).toEqual(['Job not found']);
    expect(error.message).toBe('Job not found');
    expect(error.isNotFound).toBe(true);
  });

  // A form needs every violated rule, not just the first, so the array is kept.
  it('keeps every message a validation failure returns', () => {
    const error = toApiError(
      httpError(
        { statusCode: 400, message: ['email must be an email', 'password too short'] },
        400,
      ),
    );

    expect(error.messages).toHaveLength(2);
    expect(error.isValidationError).toBe(true);
  });

  it('explains a request that never reached the server', () => {
    const error = toApiError(httpError(new ProgressEvent('error'), 0, ''));

    expect(error.isNetworkError).toBe(true);
    expect(error.message).toContain('Cannot reach the server');
  });

  // Without this the user would be shown "[object Object]".
  it('falls back to the status text for a body it does not recognise', () => {
    const error = toApiError(httpError({ unexpected: true }, 502, 'Bad Gateway'));

    expect(error.message).toBe('Bad Gateway');
  });
});
