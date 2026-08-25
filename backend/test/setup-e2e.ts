// The rate limiter is a property of the running application (M1.4), so it is on
// by default everywhere — including here. The e2e suite sends far more requests
// from one address in a minute than any real client would, so it turns the
// limiter off and `throttling.e2e-spec.ts` turns it back on for itself. Without
// this, adding a test to auth.e2e-spec.ts could fail an unrelated one further
// down the file.
process.env.THROTTLE_ENABLED = 'false';
