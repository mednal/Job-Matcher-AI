/**
 * Per-key minimum-interval limiter (§7.3.3).
 *
 * Conservative and client-side on purpose: it applies our own ceiling regardless of
 * what the source enforces, so the application stays a well-behaved client even
 * against a permissive API. Requests for one key are serialized through a promise
 * chain, so concurrency cannot burst past the interval.
 */
export class RateLimiter {
  private readonly nextFreeAt = new Map<string, number>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  /** Resolves when the caller may issue a request for `key`. */
  acquire(key: string, requestsPerSecond: number): Promise<void> {
    const intervalMs =
      requestsPerSecond > 0 ? Math.ceil(1000 / requestsPerSecond) : 0;

    const previous = this.queues.get(key) ?? Promise.resolve();
    const turn = previous.then(async () => {
      const earliest = this.nextFreeAt.get(key) ?? 0;
      const wait = earliest - this.now();
      if (wait > 0) {
        await this.sleep(wait);
      }
      this.nextFreeAt.set(key, this.now() + intervalMs);
    });

    // Keep the chain alive even if a caller rejects downstream; the limiter only
    // sequences turns, it does not care whether the request itself succeeded.
    this.queues.set(
      key,
      turn.catch(() => undefined),
    );
    return turn;
  }
}
