// Typed error hierarchy for source integrations (M5.2).
//
// The distinction that matters is `terminatesRun`. One malformed posting must not
// throw away the other 199 that fetched cleanly, but a 429 must stop the run
// immediately rather than degrade into a retry storm. Callers branch on this flag,
// never on a string match against a message.

export abstract class SourceError extends Error {
  /**
   * true  — the run for this source must stop now.
   * false — the item is skipped, counted as failed, and the run continues.
   */
  abstract readonly terminatesRun: boolean;

  protected constructor(
    readonly sourceKey: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options as ErrorOptions);
    this.name = new.target.name;
  }
}

/**
 * One posting could not be processed — missing id, unparseable entry, absent URL.
 * Degrades: the item is dropped and the run carries on.
 */
export class SourceItemError extends SourceError {
  readonly terminatesRun = false;

  constructor(
    sourceKey: string,
    message: string,
    readonly externalId?: string,
    options?: { cause?: unknown },
  ) {
    super(sourceKey, message, options);
  }
}

/** Base for every condition that ends the run for a source. */
export abstract class SourceRunError extends SourceError {
  readonly terminatesRun = true;
}

/**
 * 401 or 403 (§7.3.4). A stop condition, never an obstacle to route around: the
 * correct response is to end the run and have a human re-read the terms, not to
 * retry with different headers.
 */
export class SourceAccessDeniedError extends SourceRunError {
  constructor(
    sourceKey: string,
    readonly statusCode: number,
    message = `Source "${sourceKey}" denied access with ${statusCode}`,
  ) {
    super(sourceKey, message);
  }
}

/**
 * 429 (§7.3.4). Deliberately **not** retried. Exceeding a rate limit is prohibited
 * by §7.2, and a client that retries into a 429 is the retry storm the policy
 * exists to prevent. The run ends; the next scheduled run tries again.
 */
export class SourceRateLimitError extends SourceRunError {
  constructor(
    sourceKey: string,
    readonly retryAfterSeconds?: number,
    message = `Source "${sourceKey}" returned 429; ending the run without retrying`,
  ) {
    super(sourceKey, message);
  }
}

/**
 * A challenge or block page (§7.3.4). Detected **in order to stop** — never to
 * solve, evade, or work around, which §7.2 prohibits outright.
 */
export class SourceBlockedError extends SourceRunError {
  constructor(
    sourceKey: string,
    readonly reason: string,
    message = `Source "${sourceKey}" served a block or challenge page (${reason}); ending the run`,
  ) {
    super(sourceKey, message);
  }
}

/** 5xx that survived the retry budget. Transient in principle, over for this run. */
export class SourceUnavailableError extends SourceRunError {
  constructor(
    sourceKey: string,
    readonly statusCode: number,
    readonly attempts: number,
    message = `Source "${sourceKey}" returned ${statusCode} after ${attempts} attempt(s)`,
  ) {
    super(sourceKey, message);
  }
}

/** Network failure or timeout that survived the retry budget. */
export class SourceTransportError extends SourceRunError {
  constructor(
    sourceKey: string,
    readonly attempts: number,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(sourceKey, message, options);
  }
}

/**
 * The response arrived but was not what the contract promises — wrong content type,
 * unparseable body. Not retried: a malformed response is a bug or a changed API,
 * and hammering it will not fix either.
 */
export class SourceProtocolError extends SourceRunError {
  constructor(
    sourceKey: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(sourceKey, message, options);
  }
}

/** The descriptor a source declared is invalid — a boot-time failure (A2). */
export class SourceDescriptorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceDescriptorError';
  }
}
