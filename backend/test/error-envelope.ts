// The error envelope carries a `requestId` that is unique per request (M1.4), so
// two responses that are meant to be indistinguishable to a caller are no longer
// deep-equal. Comparing them without it is comparing what the caller can learn.
export function withoutRequestId(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) {
    return body;
  }
  const rest: Record<string, unknown> = {
    ...(body as Record<string, unknown>),
  };
  delete rest.requestId;
  return rest;
}
