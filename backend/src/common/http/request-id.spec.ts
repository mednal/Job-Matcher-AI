import { resolveRequestId, getRequestId } from './request-id';

describe('resolveRequestId', () => {
  it('keeps a caller-supplied id, so one id spans the whole call', () => {
    expect(resolveRequestId('a1b2-c3d4.e5')).toBe('a1b2-c3d4.e5');
  });

  it('mints one when the caller sent none', () => {
    const id = resolveRequestId(undefined);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  // The id is echoed in a header and written into every log line for the
  // request, so anything that could forge a log entry or break a line is
  // replaced rather than sanitized — a mangled id is not the caller's id either
  // way, and replacing it keeps the value one shape.
  it.each([
    ['an empty header', ''],
    ['a newline', 'abc\ndef'],
    ['a carriage return', 'abc\r\n'],
    ['a space', 'abc def'],
    ['a quote that would break the JSON line', 'abc"def'],
    ['longer than 128 characters', 'a'.repeat(129)],
  ])('replaces %s', (_label, incoming) => {
    expect(resolveRequestId(incoming)).not.toBe(incoming);
  });

  it('accepts exactly 128 characters', () => {
    const id = 'a'.repeat(128);
    expect(resolveRequestId(id)).toBe(id);
  });
});

describe('getRequestId', () => {
  it('reads the id the middleware attached', () => {
    expect(getRequestId({ requestId: 'r-1' })).toBe('r-1');
  });

  // A unit test that builds its own ExecutionContext has no middleware, and the
  // filter has to answer such a request without a request id rather than crash.
  it.each([
    ['a request that never passed the middleware', {}],
    ['no request at all', undefined],
    ['a non-string id', { requestId: 7 }],
  ])('is undefined for %s', (_label, request) => {
    expect(getRequestId(request)).toBeUndefined();
  });
});
