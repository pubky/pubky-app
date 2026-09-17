import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCdnUrl, getNexusUrl } from '@/config/nexus';
import { ClientErrorCode, RateLimitErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { parseResponseOrThrow } from '@/libs/http/response.utils';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
import { mockResponse } from '@/test-utils/dom';
import { asOpaque } from '@/test-utils/type-assertions';
import {
  buildCdnUrl,
  buildNexusUrl,
  buildUrlWithQuery,
  createFetchOptions,
  getNexusResponseStartedAt,
  queryNexus,
} from './nexus.utils';

describe('nexus.utils', () => {
  it.each([undefined, 60_000])('forces revalidation even with staleTime %s', async (staleTime) => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(['old'])))
      .mockResolvedValueOnce(new Response(JSON.stringify(['new'])));
    const url = `${getNexusUrl()}/forced-tag-refresh-test-${staleTime}`;
    expect(await queryNexus({ url })).toEqual(['old']);
    expect(await queryNexus({ url })).toEqual(['old']);
    expect(await queryNexus({ url, force: true, staleTime })).toEqual(['new']);
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockRestore();
  });
  it('starts forced revalidation after an already in-flight identical request', async () => {
    let resolveOld!: (response: Response) => void;
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
      )
      .mockResolvedValue(new Response(JSON.stringify(['new'])));
    try {
      const url = `${getNexusUrl()}/in-flight-forced-tag-refresh-test`;
      const old = queryNexus({ url });
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      const fresh = queryNexus({ url, force: true });
      resolveOld(new Response(JSON.stringify(['old'])));
      expect(await old).toEqual(['old']);
      expect(await fresh).toEqual(['new']);
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      fetch.mockRestore();
    }
  });

  describe('buildNexusUrl', () => {
    it('should build correct Nexus URL', () => {
      expect(buildNexusUrl('v0/users')).toBe(`${getNexusUrl()}/v0/users`);
    });
  });

  describe('buildCdnUrl', () => {
    it('should build correct CDN URL', () => {
      expect(buildCdnUrl('avatar/user123')).toBe(`${getCdnUrl()}/avatar/user123`);
    });
  });

  describe('buildUrlWithQuery', () => {
    it('should build URL with query parameters', () => {
      const result = buildUrlWithQuery({ baseRoute: 'v0/posts', params: { limit: 10, offset: 0 } });
      expect(result).toContain('limit=10');
      expect(result).toContain('offset=0');
    });

    it('should exclude path parameters from query string', () => {
      const result = buildUrlWithQuery({
        baseRoute: 'v0/posts',
        params: { post_id: '123', limit: 10 },
        excludeKeys: ['post_id'],
      });
      expect(result).not.toContain('post_id');
      expect(result).toContain('limit=10');
    });

    it('should exclude undefined and null values', () => {
      const result = buildUrlWithQuery({
        baseRoute: 'v0/posts',
        params: { limit: 10, offset: undefined, filter: null },
      });
      expect(result).toContain('limit=10');
      expect(result).not.toContain('offset');
      expect(result).not.toContain('filter');
    });
  });

  describe('createFetchOptions', () => {
    it('should create GET options without Content-Type (no CORS preflight)', () => {
      const result = createFetchOptions({ method: HttpMethod.GET });
      expect(result.method).toBe('GET');
      expect(result.headers).toBeUndefined();
      expect(result.body).toBeUndefined();
    });

    it('should create POST options with body and JSON headers', () => {
      const body = JSON.stringify({ key: 'value' });
      const result = createFetchOptions({ method: HttpMethod.POST, body });
      expect(result.method).toBe('POST');
      expect(result.body).toBe(body);
      expect(result.headers).toEqual({ 'Content-Type': 'application/json' });
    });
  });

  describe('parseResponseOrThrow', () => {
    const createMockResponse = (overrides: Partial<Response> = {}) =>
      mockResponse({
        status: 200,
        headers: asOpaque<Headers>({ get: vi.fn() }),
        text: vi.fn().mockResolvedValue(''),
        ...overrides,
      });

    it('should throw server error for 204 No Content with empty body', async () => {
      const response = createMockResponse({ status: 204, text: vi.fn().mockResolvedValue('') });
      await expect(parseResponseOrThrow(response, ErrorService.Nexus, 'testOp')).rejects.toMatchObject({
        category: ErrorCategory.Server,
        code: ServerErrorCode.INVALID_RESPONSE,
      });
    });

    it('should throw server error for empty text', async () => {
      const response = createMockResponse({ text: vi.fn().mockResolvedValue('') });
      await expect(parseResponseOrThrow(response, ErrorService.Nexus, 'testOp')).rejects.toMatchObject({
        category: ErrorCategory.Server,
        code: ServerErrorCode.INVALID_RESPONSE,
      });
    });

    it('should parse valid JSON response', async () => {
      const mockData = { id: '123', name: 'test' };
      const response = createMockResponse({
        text: vi.fn().mockResolvedValue(JSON.stringify(mockData)),
      });
      expect(await parseResponseOrThrow<typeof mockData>(response, ErrorService.Nexus, 'testOp')).toEqual(mockData);
    });

    it('should throw server error for invalid JSON', async () => {
      const response = createMockResponse({ text: vi.fn().mockResolvedValue('invalid json {') });
      await expect(parseResponseOrThrow(response, ErrorService.Nexus, 'testOp')).rejects.toMatchObject({
        category: ErrorCategory.Server,
        code: ServerErrorCode.INVALID_RESPONSE,
      });
    });
  });

  describe('queryNexus', () => {
    const mockFetch = vi.fn();
    const createMockResponse = (overrides: Partial<Response> = {}) => ({
      ok: true,
      status: 200,
      headers: { get: vi.fn() },
      text: vi.fn().mockResolvedValue(''),
      ...overrides,
    });

    beforeEach(async () => {
      vi.clearAllMocks();
      global.fetch = mockFetch;
      // Clear query client cache between tests
      const { nexusQueryClient } = await import('./nexus.query-client');
      nexusQueryClient.clear();
    });

    it('keeps actual request-start evidence through delayed, joined, cached and structurally shared responses', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
      const pending = Promise.withResolvers<Response>();
      mockFetch.mockReturnValueOnce(pending.promise);
      const url = 'https://example.com/api/snapshot-cutoff';
      try {
        const first = queryNexus<object>({ url });
        await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledOnce());
        now.mockReturnValue(5000);
        const joined = queryNexus<object>({ url });
        pending.resolve(new Response(JSON.stringify({ tags: [] })));
        const [a, b] = await Promise.all([first, joined]);
        expect(a).toBe(b);
        expect(getNexusResponseStartedAt(a)).toBe(1000);
        expect(getNexusResponseStartedAt(b)).toBe(1000);
        now.mockReturnValue(6000);
        expect(getNexusResponseStartedAt(await queryNexus<object>({ url }))).toBe(1000);
        mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ tags: [] })));
        const refreshed = await queryNexus<object>({ url, force: true });
        expect(refreshed).toEqual(a);
        const shared = await queryNexus<object>({ url });
        expect(shared).toBe(a);
        expect(getNexusResponseStartedAt(shared)).toBe(6000);
        expect(getNexusResponseStartedAt(refreshed)).toBe(6000);
        expect(getNexusResponseStartedAt({ tags: [] })).toBeUndefined();
      } finally {
        now.mockRestore();
      }
    });

    it('should fetch and parse JSON response successfully', async () => {
      const mockData = { id: '123', name: 'test' };
      const url = 'https://example.com/api/test1';
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ text: vi.fn().mockResolvedValue(JSON.stringify(mockData)) }),
      );

      const result = await queryNexus<typeof mockData>({ url });
      expect(result).toEqual(mockData);
    });

    it('should use POST method with body when provided', async () => {
      const body = JSON.stringify({ key: 'value' });
      const mockData = { success: true };
      const url = 'https://example.com/api/test2';
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ text: vi.fn().mockResolvedValue(JSON.stringify(mockData)) }),
      );

      await queryNexus({ url, method: HttpMethod.POST, body });
      expect(mockFetch).toHaveBeenCalledWith(url, expect.objectContaining({ method: 'POST', body }));
    });

    it('keeps the default cache policy for callers that do not override it', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ text: vi.fn().mockResolvedValue('{"version":1}') }));
      const params = { url: 'https://example.com/api/cached' };

      await queryNexus(params);
      await queryNexus(params);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('revalidates stale pages while sharing concurrent requests', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ text: vi.fn().mockResolvedValue('{"version":1}') }));
      const params = { url: 'https://example.com/api/revalidate', staleTime: 0 };
      expect(await queryNexus(params)).toEqual({ version: 1 });
      mockFetch.mockResolvedValueOnce(createMockResponse({ text: vi.fn().mockResolvedValue('{"version":2}') }));

      const results = await Promise.all([queryNexus(params), queryNexus(params)]);

      expect(results).toEqual([{ version: 2 }, { version: 2 }]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw server error for empty response', async () => {
      const url = 'https://example.com/api/test3';
      mockFetch.mockResolvedValueOnce(createMockResponse({ status: 204, text: vi.fn().mockResolvedValue('') }));
      await expect(queryNexus({ url })).rejects.toMatchObject({
        category: ErrorCategory.Server,
        code: ServerErrorCode.INVALID_RESPONSE,
      });
    });

    it('should propagate errors', async () => {
      const errorUrl = 'https://example.com/api/error';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers(),
        text: vi.fn().mockResolvedValue(''),
      });

      await expect(queryNexus({ url: errorUrl })).rejects.toMatchObject({
        category: ErrorCategory.Client,
        code: ClientErrorCode.BAD_REQUEST,
      });
    });
  });

  describe('429 pressure on the rate-limited by_ids endpoints', () => {
    const mockFetch = vi.fn();
    const originalFetch = globalThis.fetch;

    const nexusResponse = (body: unknown) => new Response(JSON.stringify(body));
    const tooManyRequests = (retryAfter?: string) =>
      new Response('Too Many Requests', {
        status: 429,
        ...(retryAfter === undefined ? {} : { headers: { 'retry-after': retryAfter } }),
      });

    beforeEach(async () => {
      vi.clearAllMocks();
      globalThis.fetch = mockFetch;
      const { nexusQueryClient } = await import('./nexus.query-client');
      nexusQueryClient.clear();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.useRealTimers();
    });

    it('collapses two concurrent identical posts/by_ids calls into one request', async () => {
      const posts = [{ details: { author: 'author1', id: 'post1' } }];
      mockFetch.mockResolvedValueOnce(nexusResponse(posts));

      const [first, second] = await Promise.all([
        NexusPostStreamService.fetchByIds({ post_ids: ['author1:post2', 'author1:post1'] }),
        NexusPostStreamService.fetchByIds({ post_ids: ['author1:post1', 'author1:post2'] }),
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(first).toEqual(posts);
      expect(second).toEqual(posts);
    });

    it('collapses two concurrent identical users/by_ids calls into one request', async () => {
      const users = [{ details: { id: 'user1' } }];
      mockFetch.mockResolvedValueOnce(nexusResponse(users));

      await Promise.all([
        NexusUserStreamService.fetchByIds({ user_ids: ['user2', 'user1'] }),
        NexusUserStreamService.fetchByIds({ user_ids: ['user1', 'user2'] }),
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not reuse a forced revalidation that is already fetching, and starts the follow-up after it settles', async () => {
      const posts = [{ details: { author: 'author1', id: 'post1' } }];
      const inFlight = Promise.withResolvers<Response>();
      const url = `${getNexusUrl()}/forced-follow-up-after-start-test`;
      mockFetch.mockReturnValueOnce(inFlight.promise).mockImplementation(() => Promise.resolve(nexusResponse(posts)));

      const older = queryNexus<object>({ url, force: true });
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
      const fresh = queryNexus<object>({ url, force: true });
      inFlight.resolve(nexusResponse([]));

      expect(await older).toEqual([]);
      expect(await fresh).toEqual(posts);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('shares one revalidation among the forced callers that arrive before it starts, behind a pending ordinary request', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
      const ordinary = Promise.withResolvers<Response>();
      const url = `${getNexusUrl()}/pending-ordinary-forced-waiters-test`;
      mockFetch
        .mockReturnValueOnce(ordinary.promise)
        .mockImplementation(() => Promise.resolve(nexusResponse([{ details: { id: 'user1' } }])));
      try {
        // A profile cache-miss fetch, still running when a TTL tick and a notification
        // hydration both force the same user batch.
        const miss = queryNexus<object>({ url });
        await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
        now.mockReturnValue(2_000);
        const ttl = queryNexus<object>({ url, force: true });
        const notification = queryNexus<object>({ url, force: true });
        ordinary.resolve(nexusResponse([]));

        expect(await miss).toEqual([]);
        const [fromTtl, fromNotification] = await Promise.all([ttl, notification]);
        // Two requests: the ordinary fetch, then one revalidation shared by both forced
        // callers, because it starts after both of them. A third request would load the
        // rate-limited endpoint without buying the later caller any freshness.
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(fromTtl).toBe(fromNotification);
        expect(fromTtl).toEqual([{ details: { id: 'user1' } }]);
        expect(getNexusResponseStartedAt(fromTtl)).toBe(2_000);
      } finally {
        now.mockRestore();
      }
    });

    it('gives a forced caller a response started after its own call, never the older in-flight one', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
      const inFlight = Promise.withResolvers<Response>();
      const url = `${getNexusUrl()}/stale-forced-revalidation-test`;
      mockFetch
        .mockReturnValueOnce(inFlight.promise)
        .mockImplementation(() => Promise.resolve(nexusResponse([{ details: { author: 'author1', id: 'post1' } }])));
      try {
        // A TTL tick opens a revalidation; the notification arrives while it is still fetching.
        const ttl = queryNexus<object>({ url, force: true });
        await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
        now.mockReturnValue(2_000);
        const notification = queryNexus<object>({ url, force: true });
        inFlight.resolve(nexusResponse([]));

        // Reusing the older request would hand back its empty tag list stamped as fresh.
        expect(await ttl).toEqual([]);
        const hydrated = await notification;
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(hydrated).toEqual([{ details: { author: 'author1', id: 'post1' } }]);
        expect(getNexusResponseStartedAt(hydrated)).toBe(2_000);
      } finally {
        now.mockRestore();
      }
    });

    it('shares one follow-up among the forced callers waiting behind a running revalidation', async () => {
      const inFlight = Promise.withResolvers<Response>();
      const url = `${getNexusUrl()}/shared-forced-follow-up-test`;
      mockFetch
        .mockReturnValueOnce(inFlight.promise)
        .mockImplementation(() => Promise.resolve(nexusResponse([{ details: { id: 'user1' } }])));

      const running = queryNexus<object>({ url, force: true });
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
      const waiters = [queryNexus<object>({ url, force: true }), queryNexus<object>({ url, force: true })];
      inFlight.resolve(nexusResponse([]));

      const [first, second] = await Promise.all(waiters);
      expect(await running).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(first).toBe(second);
      expect(first).toEqual([{ details: { id: 'user1' } }]);
    });

    it('does not retry a 429 before the server Retry-After (delta-seconds) has elapsed', async () => {
      vi.useFakeTimers();
      mockFetch.mockResolvedValueOnce(tooManyRequests('5')).mockResolvedValueOnce(nexusResponse([]));

      const pending = NexusPostStreamService.fetchByIds({ post_ids: ['author1:post1'] });
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(4_900);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      await expect(pending).resolves.toEqual([]);
    });

    it('does not retry a 429 before the server Retry-After (HTTP-date) has elapsed', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-16T00:00:00Z'));
      mockFetch
        .mockResolvedValueOnce(tooManyRequests(new Date(Date.now() + 4_000).toUTCString()))
        .mockResolvedValueOnce(nexusResponse([]));

      const pending = NexusPostStreamService.fetchByIds({ post_ids: ['author1:post1'] });
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(3_900);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      await expect(pending).resolves.toEqual([]);
    });

    it('clamps a long Retry-After so the caller is not parked for the server-dictated hour', async () => {
      vi.useFakeTimers();
      mockFetch.mockResolvedValueOnce(tooManyRequests('3600')).mockResolvedValueOnce(nexusResponse([]));

      const pending = NexusPostStreamService.fetchByIds({ post_ids: ['author1:post1'] });
      await vi.advanceTimersByTimeAsync(0);

      await vi.advanceTimersByTimeAsync(29_900);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      await expect(pending).resolves.toEqual([]);
    });

    it('keeps the 2s floor when the 429 carries no Retry-After', async () => {
      vi.useFakeTimers();
      mockFetch.mockResolvedValueOnce(tooManyRequests()).mockResolvedValueOnce(nexusResponse([]));

      const pending = NexusPostStreamService.fetchByIds({ post_ids: ['author1:post1'] });
      await vi.advanceTimersByTimeAsync(0);

      await vi.advanceTimersByTimeAsync(1_900);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      await expect(pending).resolves.toEqual([]);
    });

    it('still surfaces the rate-limit error when the retry is rejected too', async () => {
      vi.useFakeTimers();
      mockFetch.mockImplementation(() => Promise.resolve(tooManyRequests('3')));

      const pending = NexusPostStreamService.fetchByIds({ post_ids: ['author1:post1'] });
      const rejection = expect(pending).rejects.toMatchObject({
        category: ErrorCategory.RateLimit,
        code: RateLimitErrorCode.RATE_LIMITED,
      });
      await vi.advanceTimersByTimeAsync(3_500);
      await rejection;
      // Initial attempt plus the single rateLimited retry — no storm.
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('leaves the non-429 retry path unchanged', async () => {
      vi.useFakeTimers();
      mockFetch.mockImplementation(() => Promise.resolve(new Response('Bad Request', { status: 400 })));

      await expect(queryNexus({ url: `${getNexusUrl()}/probe-client-error` })).rejects.toMatchObject({
        category: ErrorCategory.Client,
        code: ClientErrorCode.BAD_REQUEST,
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      mockFetch.mockClear();
      mockFetch.mockImplementation(() => Promise.resolve(new Response('Unavailable', { status: 503 })));
      const pending = queryNexus({ url: `${getNexusUrl()}/probe-server-error` });
      const rejection = expect(pending).rejects.toMatchObject({ category: ErrorCategory.Server });

      // serverError backoff is 1s/2s/4s (1000 * 2^attemptIndex) — unchanged, and the
      // rate-limit floor must not leak into this path.
      await vi.advanceTimersByTimeAsync(900);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(20_000);
      await rejection;
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });
});
