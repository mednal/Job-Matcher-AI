import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RootConfig } from '../../../common/config/configuration';
import type { FetchContext, SourceDescriptor } from '../source-adapter.types';
import {
  SourceAccessDeniedError,
  SourceBlockedError,
  SourceProtocolError,
  SourceRateLimitError,
  SourceTransportError,
  SourceUnavailableError,
} from '../source-errors';
import { RateLimiter } from './rate-limiter';

/**
 * The single path an adapter has to the network (§6.1, §7.3).
 *
 * Every guardrail §7 requires lives here rather than in per-source code: the
 * truthful User-Agent, the client-side rate limit, the retry policy, the timeout,
 * and the classification of a response into a typed error. An adapter that wanted
 * to bypass one of them would have to import an HTTP library directly, which
 * `sources.imports.spec.ts` fails the build for.
 *
 * Node 24 global `fetch` + `AbortSignal.timeout` (decision A7). No axios, no
 * `@nestjs/axios`, no other HTTP dependency.
 */

/** Injection seam for the unit tests; production uses the real globals. */
export const SOURCE_HTTP_DEPS = Symbol('SOURCE_HTTP_DEPS');

export interface SourceHttpDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
}

export interface SourceRequestOptions {
  readonly method?: 'GET';
  readonly headers?: Record<string, string>;
  readonly timeoutMs?: number;
}

/** Retries apply to 5xx and network failures only — never to 4xx. */
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Markers of a challenge/block page served with a 200. Matched **only to stop the
 * run** (§7.3.4). This is detection, never evasion: §7.2 prohibits solving or
 * working around a challenge, so the sole permitted response is to end the run and
 * have a human re-read the terms.
 */
const BLOCK_PAGE_MARKERS = [
  'captcha',
  'are you a robot',
  'unusual traffic',
  'access denied',
  'request blocked',
  'attention required',
];

@Injectable()
export class SourceHttpClient {
  private readonly logger = new Logger(SourceHttpClient.name);
  private readonly limiter: RateLimiter;
  private readonly userAgent: string;

  constructor(
    configService: ConfigService<RootConfig, true>,
    @Optional()
    @Inject(SOURCE_HTTP_DEPS)
    private readonly deps?: SourceHttpDeps,
  ) {
    const contact = configService.get('sources.userAgentContact', {
      infer: true,
    });
    // §7.3.2: truthful and descriptive, naming the application and a reachable
    // contact address. Never a browser string — §7.2 prohibits disguising the
    // client, and a contact address is what lets a source tell us to stop.
    //
    // No version segment on purpose: a hard-coded one drifts into a falsehood the
    // moment it is not bumped, and this field's only job is to be true.
    this.userAgent = `JuniorJobAI (+${contact})`;
    this.limiter = new RateLimiter(this.deps?.now, this.deps?.sleep);
  }

  /** The User-Agent every source request carries. Exposed for the compliance test. */
  get userAgentString(): string {
    return this.userAgent;
  }

  /**
   * Fetch and parse JSON, applying the rate limit, retry policy and stop
   * conditions. Throws a typed `SourceRunError` on every failure path.
   */
  async fetchJson<T>(
    descriptor: SourceDescriptor,
    url: string,
    ctx: FetchContext,
    options: SourceRequestOptions = {},
  ): Promise<T> {
    const response = await this.request(descriptor, url, ctx, options);

    const contentType = response.headers.get('content-type') ?? '';
    const body = await response.text();

    // A source that answers a JSON request with HTML is either broken or serving an
    // interstitial. Check for a block page before blaming the parser.
    if (!contentType.includes('json')) {
      const marker = this.blockPageMarker(body);
      if (marker) {
        throw new SourceBlockedError(descriptor.key, `matched "${marker}"`);
      }
      throw new SourceProtocolError(
        descriptor.key,
        `Expected JSON from ${url} but received content-type "${contentType || 'none'}"`,
      );
    }

    try {
      return JSON.parse(body) as T;
    } catch (error) {
      throw new SourceProtocolError(
        descriptor.key,
        `Malformed JSON from ${url}`,
        { cause: error },
      );
    }
  }

  /**
   * The raw request path. Public so an adapter for a feed format (RSS/Atom) can use
   * it, but it applies exactly the same guardrails as `fetchJson`.
   */
  async request(
    descriptor: SourceDescriptor,
    url: string,
    ctx: FetchContext,
    options: SourceRequestOptions = {},
  ): Promise<Response> {
    const target = this.requireHttps(descriptor, url);
    const doFetch = this.deps?.fetch ?? globalThis.fetch;
    const sleep =
      this.deps?.sleep ??
      ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    let lastTransportError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await this.limiter.acquire(
        descriptor.key,
        descriptor.defaults.rateLimitRps,
      );

      if (ctx.signal.aborted) {
        throw new SourceTransportError(
          descriptor.key,
          attempt,
          `Run aborted before requesting ${target}`,
        );
      }

      let response: Response;
      try {
        response = await doFetch(target, {
          method: options.method ?? 'GET',
          headers: {
            'user-agent': this.userAgent,
            accept: 'application/json',
            ...options.headers,
          },
          redirect: 'follow',
          signal: this.timeoutSignal(ctx.signal, timeoutMs),
        });
      } catch (error) {
        lastTransportError = error;
        // Network-level failure: retryable, unless the run itself was aborted.
        if (ctx.signal.aborted) {
          throw new SourceTransportError(
            descriptor.key,
            attempt,
            `Run aborted while requesting ${target}`,
            { cause: error },
          );
        }
        if (attempt < MAX_ATTEMPTS) {
          await sleep(this.backoffMs(attempt));
          continue;
        }
        throw new SourceTransportError(
          descriptor.key,
          attempt,
          `Network failure requesting ${target}: ${this.messageOf(error)}`,
          { cause: error },
        );
      }

      // --- Stop conditions (§7.3.4). None of these is retried. ---
      if (response.status === 401 || response.status === 403) {
        this.logger.error(
          `[${descriptor.key}] ${response.status} from ${target} — ending the run. ` +
            'This is a stop condition: re-read the terms, do not route around it.',
        );
        throw new SourceAccessDeniedError(descriptor.key, response.status);
      }

      if (response.status === 429) {
        const retryAfter = this.retryAfterSeconds(response);
        // Deliberately no retry and no backoff-and-continue. Exceeding a rate limit
        // is prohibited by §7.2, and retrying into a 429 is the retry storm the
        // policy exists to prevent. The next scheduled run tries again.
        this.logger.error(
          `[${descriptor.key}] 429 from ${target} — ending the run without retrying` +
            (retryAfter !== undefined ? ` (retry-after ${retryAfter}s)` : ''),
        );
        throw new SourceRateLimitError(descriptor.key, retryAfter);
      }

      if (response.status >= 500) {
        if (attempt < MAX_ATTEMPTS) {
          this.logger.warn(
            `[${descriptor.key}] ${response.status} from ${target}; retrying (attempt ${attempt}/${MAX_ATTEMPTS})`,
          );
          await sleep(this.backoffMs(attempt));
          continue;
        }
        throw new SourceUnavailableError(
          descriptor.key,
          response.status,
          attempt,
        );
      }

      if (!response.ok) {
        // Any other 4xx. Not retried — the request is wrong, and repeating it
        // unchanged cannot make it right.
        throw new SourceProtocolError(
          descriptor.key,
          `Unexpected ${response.status} from ${target}`,
        );
      }

      return response;
    }

    // Unreachable: the loop either returns or throws. Kept so the type is honest.
    throw new SourceTransportError(
      descriptor.key,
      MAX_ATTEMPTS,
      `Exhausted ${MAX_ATTEMPTS} attempts requesting ${target}: ${this.messageOf(
        lastTransportError,
      )}`,
      { cause: lastTransportError },
    );
  }

  /**
   * §7.1 permits no plaintext access method, and an http URL would send our
   * User-Agent and any credential in the clear.
   */
  private requireHttps(descriptor: SourceDescriptor, url: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new SourceProtocolError(
        descriptor.key,
        `Adapter requested a malformed URL: ${url}`,
      );
    }
    if (parsed.protocol !== 'https:') {
      throw new SourceProtocolError(
        descriptor.key,
        `Adapter requested a non-https URL (${parsed.protocol}//): ${url}`,
      );
    }
    return parsed.toString();
  }

  /**
   * Combines the run's abort signal with a per-request timeout, so a hung source
   * cannot pin a run open and a cancelled run drops its in-flight request.
   */
  private timeoutSignal(
    runSignal: AbortSignal,
    timeoutMs: number,
  ): AbortSignal {
    const timeout = AbortSignal.timeout(timeoutMs);
    return AbortSignal.any([runSignal, timeout]);
  }

  private backoffMs(attempt: number): number {
    // Exponential with jitter (§7.3.3), so parallel sources do not resynchronize
    // onto the same retry instant.
    const base = BASE_BACKOFF_MS * 2 ** (attempt - 1);
    return base + Math.floor(Math.random() * BASE_BACKOFF_MS);
  }

  private retryAfterSeconds(response: Response): number | undefined {
    const header = response.headers.get('retry-after');
    if (!header) {
      return undefined;
    }
    const seconds = Number(header);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
  }

  private blockPageMarker(body: string): string | undefined {
    const haystack = body.slice(0, 4096).toLowerCase();
    return BLOCK_PAGE_MARKERS.find((marker) => haystack.includes(marker));
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
