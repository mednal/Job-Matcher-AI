import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SourceHttpClient, type SourceHttpDeps } from './source-http-client';
import type { FetchContext, SourceDescriptor } from '../source-adapter.types';
import {
  SourceAccessDeniedError,
  SourceBlockedError,
  SourceProtocolError,
  SourceRateLimitError,
  SourceTransportError,
  SourceUnavailableError,
} from '../source-errors';

const CONTACT = 'https://github.com/mednal/Job-Matcher-AI';

function descriptor(
  overrides: Partial<SourceDescriptor> = {},
): SourceDescriptor {
  return {
    key: 'example-source',
    displayName: 'Example Source',
    accessMethod: 'PUBLIC_API',
    termsUrl: 'https://example.com/terms',
    complianceNote: 'Documented public API.',
    ordering: 'RECENT_FIRST',
    // Effectively unthrottled so the tests are not pacing themselves; the rate
    // limiter has its own spec.
    defaults: { rateLimitRps: 1000, pageSize: 10, maxPages: 5 },
    ...overrides,
  };
}

function context(): FetchContext & { controller: AbortController } {
  const controller = new AbortController();
  return {
    runId: 'run-1',
    signal: controller.signal,
    logger: new Logger('test'),
    controller,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(
  body: string,
  status = 200,
  contentType = 'text/html',
): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': contentType },
  });
}

function statusResponse(
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response('', { status, headers });
}

interface Harness {
  client: SourceHttpClient;
  fetchMock: jest.Mock;
  sleepMock: jest.Mock;
  /**
   * Retry backoffs only. The rate limiter shares this `sleep`, so counting every
   * call would conflate throttling with retrying — and it is the retrying these
   * tests are about.
   */
  backoffSleeps: () => number[];
}

/**
 * jest types `mock.calls` as `any[][]`; narrow once so the header and signal
 * assertions stay type-checked.
 */
function fetchInit(mock: jest.Mock, call = 0): RequestInit {
  return (mock.mock.calls as unknown as unknown[][])[call][1] as RequestInit;
}

function harness(): Harness {
  const fetchMock = jest.fn();
  const sleepMock = jest.fn().mockResolvedValue(undefined);
  const deps: SourceHttpDeps = {
    fetch: fetchMock,
    sleep: sleepMock,
    now: () => 0,
  };
  const config = {
    get: (key: string) =>
      key === 'sources.userAgentContact' ? CONTACT : undefined,
  } as unknown as ConfigService<never, true>;

  return {
    client: new SourceHttpClient(config, deps),
    fetchMock,
    sleepMock,
    backoffSleeps: () =>
      (sleepMock.mock.calls as [number][])
        .map(([ms]) => ms)
        .filter((ms) => ms >= 500),
  };
}

describe('SourceHttpClient', () => {
  describe('User-Agent (§7.3.2)', () => {
    it('sends a truthful User-Agent naming the app and a contact address', async () => {
      const { client, fetchMock } = harness();
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      await client.fetchJson(
        descriptor(),
        'https://example.com/jobs',
        context(),
      );

      const headers = fetchInit(fetchMock).headers as Record<string, string>;
      expect(headers['user-agent']).toBe(`JuniorJobAI (+${CONTACT})`);
      expect(headers['user-agent']).toContain(CONTACT);
    });

    // §7.2 prohibits disguising the client. A browser string would be exactly that.
    it('never impersonates a browser', () => {
      const { client } = harness();

      expect(client.userAgentString).not.toMatch(
        /mozilla|chrome|safari|gecko/i,
      );
    });
  });

  describe('stop conditions (§7.3.4)', () => {
    // M5.2's Verify line: a 429 ends the run and logs, with no retry storm.
    it('ends the run on 429 without retrying', async () => {
      const { client, fetchMock, backoffSleeps } = harness();
      fetchMock.mockResolvedValue(statusResponse(429));
      const errorLog = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      await expect(
        client.fetchJson(descriptor(), 'https://example.com/jobs', context()),
      ).rejects.toBeInstanceOf(SourceRateLimitError);

      // Exactly one request, and no backoff: retrying into a 429 is the retry storm
      // §7.2 exists to prevent.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(backoffSleeps()).toEqual([]);
      expect(errorLog).toHaveBeenCalledWith(
        expect.stringContaining('without retrying'),
      );

      errorLog.mockRestore();
    });

    it('surfaces retry-after from a 429 without acting on it', async () => {
      const { client, fetchMock } = harness();
      fetchMock.mockResolvedValue(
        statusResponse(429, { 'retry-after': '120' }),
      );

      await expect(
        client.fetchJson(descriptor(), 'https://example.com/jobs', context()),
      ).rejects.toMatchObject({ retryAfterSeconds: 120 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each([401, 403])(
      'ends the run on %s without retrying',
      async (status) => {
        const { client, fetchMock, backoffSleeps } = harness();
        fetchMock.mockResolvedValue(statusResponse(status));

        await expect(
          client.fetchJson(descriptor(), 'https://example.com/jobs', context()),
        ).rejects.toBeInstanceOf(SourceAccessDeniedError);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(backoffSleeps()).toEqual([]);
      },
    );

    // Detection exists to stop, never to evade (§7.2).
    it.each([
      ['captcha', '<html><body>Please complete the CAPTCHA</body></html>'],
      [
        'unusual traffic',
        '<html>We detected unusual traffic from your network</html>',
      ],
      ['access denied', '<html><h1>Access Denied</h1></html>'],
    ])('treats a %s page as a stop condition', async (_label, body) => {
      const { client, fetchMock } = harness();
      fetchMock.mockResolvedValue(textResponse(body));

      await expect(
        client.fetchJson(descriptor(), 'https://example.com/jobs', context()),
      ).rejects.toBeInstanceOf(SourceBlockedError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('marks every stop condition as run-terminating', async () => {
      const { client, fetchMock } = harness();
      fetchMock.mockResolvedValue(statusResponse(403));

      await expect(
        client.fetchJson(descriptor(), 'https://example.com/jobs', context()),
      ).rejects.toMatchObject({ terminatesRun: true });
    });
  });

  describe('retries', () => {
    it('retries a 5xx and succeeds on a later attempt', async () => {
      const { client, fetchMock, backoffSleeps } = harness();
      fetchMock
        .mockResolvedValueOnce(statusResponse(503))
        .mockResolvedValueOnce(jsonResponse({ ok: true }));

      await expect(
        client.fetchJson(descriptor(), 'https://example.com/jobs', context()),
      ).resolves.toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(backoffSleeps()).toHaveLength(1);
    });

    it('gives up on 5xx after a bounded number of attempts', async () => {
      const { client, fetchMock } = harness();
      fetchMock.mockResolvedValue(statusResponse(500));

      await expect(
        client.fetchJson(descriptor(), 'https://example.com/jobs', context()),
      ).rejects.toBeInstanceOf(SourceUnavailableError);
      // Bounded: three attempts, not an unbounded loop.
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('retries a network failure and then gives up', async () => {
      const { client, fetchMock } = harness();
      fetchMock.mockRejectedValue(new Error('ECONNRESET'));

      await expect(
        client.fetchJson(descriptor(), 'https://example.com/jobs', context()),
      ).rejects.toBeInstanceOf(SourceTransportError);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    // A 4xx that is not a stop condition is still not retryable: the request is
    // wrong, and repeating it unchanged cannot make it right.
    it('does not retry a 404', async () => {
      const { client, fetchMock } = harness();
      fetchMock.mockResolvedValue(statusResponse(404));

      await expect(
        client.fetchJson(descriptor(), 'https://example.com/jobs', context()),
      ).rejects.toBeInstanceOf(SourceProtocolError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('stops retrying when the run is aborted mid-flight', async () => {
      const { client, fetchMock } = harness();
      const ctx = context();
      fetchMock.mockImplementation(() => {
        ctx.controller.abort();
        return Promise.reject(new Error('aborted'));
      });

      await expect(
        client.fetchJson(descriptor(), 'https://example.com/jobs', ctx),
      ).rejects.toBeInstanceOf(SourceTransportError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('transport rules', () => {
    it('refuses a non-https URL', async () => {
      const { client, fetchMock } = harness();

      await expect(
        client.fetchJson(descriptor(), 'http://example.com/jobs', context()),
      ).rejects.toBeInstanceOf(SourceProtocolError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a malformed URL', async () => {
      const { client, fetchMock } = harness();

      await expect(
        client.fetchJson(descriptor(), 'not a url', context()),
      ).rejects.toBeInstanceOf(SourceProtocolError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a non-JSON body that is not a block page', async () => {
      const { client, fetchMock } = harness();
      fetchMock.mockResolvedValue(textResponse('<html>hello</html>'));

      await expect(
        client.fetchJson(descriptor(), 'https://example.com/jobs', context()),
      ).rejects.toBeInstanceOf(SourceProtocolError);
    });

    it('rejects malformed JSON', async () => {
      const { client, fetchMock } = harness();
      fetchMock.mockResolvedValue(
        textResponse('{ not json', 200, 'application/json'),
      );

      await expect(
        client.fetchJson(descriptor(), 'https://example.com/jobs', context()),
      ).rejects.toBeInstanceOf(SourceProtocolError);
    });

    it('passes an abort signal to fetch so a hung source cannot pin a run open', async () => {
      const { client, fetchMock } = harness();
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      await client.fetchJson(
        descriptor(),
        'https://example.com/jobs',
        context(),
      );

      expect(fetchInit(fetchMock).signal).toBeInstanceOf(AbortSignal);
    });
  });
});
