import { RateLimiter } from './rate-limiter';

/** Virtual clock: `sleep` advances time instead of waiting for it. */
function fakeClock() {
  let current = 0;
  const slept: number[] = [];
  return {
    now: () => current,
    sleep: (ms: number) => {
      slept.push(ms);
      current += ms;
      return Promise.resolve();
    },
    advance: (ms: number) => {
      current += ms;
    },
    get slept() {
      return slept;
    },
  };
}

describe('RateLimiter', () => {
  it('lets the first request through without waiting', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(clock.now, clock.sleep);

    await limiter.acquire('a', 1);

    expect(clock.slept).toEqual([]);
  });

  it('spaces consecutive requests for the same key by the interval', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(clock.now, clock.sleep);

    await limiter.acquire('a', 2); // 2 rps -> 500ms apart
    await limiter.acquire('a', 2);
    await limiter.acquire('a', 2);

    expect(clock.slept).toEqual([500, 500]);
  });

  it('does not throttle across different keys', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(clock.now, clock.sleep);

    await limiter.acquire('a', 1);
    await limiter.acquire('b', 1);

    // One source's pace must not be charged to another's budget.
    expect(clock.slept).toEqual([]);
  });

  it('does not wait when the interval has already elapsed', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(clock.now, clock.sleep);

    await limiter.acquire('a', 1);
    clock.advance(5000);
    await limiter.acquire('a', 1);

    expect(clock.slept).toEqual([]);
  });

  // Requests issued in parallel must still be serialized, or concurrency becomes a
  // way to burst straight past the ceiling §7.3.3 requires.
  it('serializes concurrent acquisitions for one key', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(clock.now, clock.sleep);

    await Promise.all([
      limiter.acquire('a', 4),
      limiter.acquire('a', 4),
      limiter.acquire('a', 4),
    ]);

    expect(clock.slept).toEqual([250, 250]);
  });

  it('keeps sequencing after a caller rejects downstream', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(clock.now, clock.sleep);

    await limiter
      .acquire('a', 2)
      .then(() => {
        throw new Error('request failed');
      })
      .catch(() => undefined);

    // The chain must not be poisoned by a failed request.
    await expect(limiter.acquire('a', 2)).resolves.toBeUndefined();
    expect(clock.slept).toEqual([500]);
  });

  it('treats a non-positive rate as no enforced interval', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(clock.now, clock.sleep);

    await limiter.acquire('a', 0);
    await limiter.acquire('a', 0);

    expect(clock.slept).toEqual([]);
  });
});
