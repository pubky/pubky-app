import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCdnUrl, getNexusUrl } from '@/config/nexus';
import { ClientErrorCode, RateLimitErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { parseResponseOrThrow } from '@/libs/http/response.utils';
import { nexusQueryClient } from '@/services/nexus/nexus.query-client';
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

    it.each(['users', 'posts'] as const)(
      'shares in-flight %s across overlapping batches and individual cards',
      async (kind) => {
        const batch = Promise.withResolvers<Response>();
        const ids = kind === 'users' ? ['alice', 'bob', 'carol'] : ['alice:one', 'bob:two', 'carol:three'];
        const records =
          kind === 'users'
            ? ids.map((id) => ({ details: { id } }))
            : [
                { details: { author: 'alice', id: 'one' } },
                { details: { author: 'bob', id: 'two' } },
                { details: { author: 'carol', id: 'three' } },
              ];
        const fetchIds = (requested: string[]) =>
          kind === 'users'
            ? NexusUserStreamService.fetchByIds({ user_ids: requested })
            : NexusPostStreamService.fetchByIds({ post_ids: requested });
        mockFetch.mockReturnValueOnce(batch.promise).mockImplementation((_url, options) => {
          const requested = JSON.parse(options.body)[kind === 'users' ? 'user_ids' : 'post_ids'] as string[];
          return Promise.resolve(nexusResponse(records.filter((_record, index) => requested.includes(ids[index]))));
        });

        const full = fetchIds(ids.slice(0, 2));
        await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
        const overlap = fetchIds(ids.slice(1));
        const card = fetchIds([ids[1]]);
        batch.resolve(nexusResponse(records.slice(0, 2)));

        const [fullResult, overlapResult, cardResult] = await Promise.all([full, overlap, card]);
        expect(fullResult).toEqual(records.slice(0, 2));
        expect(overlapResult).toEqual(records.slice(1));
        expect(cardResult).toEqual([records[1]]);
        expect(mockFetch).toHaveBeenCalledTimes(2);
        const bodies = mockFetch.mock.calls.map(([, options]) => JSON.parse(options.body));
        expect(bodies.map((body) => body[kind === 'users' ? 'user_ids' : 'post_ids'])).toEqual([
          ids.slice(0, 2),
          ids.slice(2),
        ]);
      },
    );

    it('retains the oldest start time and sorted caller subset when combining pending users', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
      const running = Promise.withResolvers<Response>();
      mockFetch
        .mockReturnValueOnce(running.promise)
        .mockResolvedValueOnce(nexusResponse([{ details: { id: 'alice' } }]));
      try {
        const original = NexusUserStreamService.fetchByIds({ user_ids: ['bob', 'carol', 'missing'] });
        now.mockReturnValue(2_000);
        const overlap = NexusUserStreamService.fetchByIds({ user_ids: ['missing', 'bob', 'alice'] });
        const missing = NexusUserStreamService.fetchByIds({ user_ids: ['missing'] });
        running.resolve(nexusResponse([{ details: { id: 'bob' } }, { details: { id: 'carol' } }]));

        await original;
        const result = await overlap;
        expect(result).toEqual([{ details: { id: 'alice' } }, { details: { id: 'bob' } }]);
        expect(getNexusResponseStartedAt(result)).toBe(1_000);
        const absent = await missing;
        expect(absent).toEqual([]);
        expect(getNexusResponseStartedAt(absent)).toBe(1_000);
        expect(mockFetch).toHaveBeenCalledTimes(2);
      } finally {
        now.mockRestore();
      }
    });

    it('isolates overlapping user reads by viewer and depth', async () => {
      const running = Promise.withResolvers<Response>();
      mockFetch.mockReturnValueOnce(running.promise).mockImplementation(() => Promise.resolve(nexusResponse([])));
      const first = NexusUserStreamService.fetchByIds({ user_ids: ['alice', 'bob'], viewer_id: 'viewer-a', depth: 1 });
      const otherViewer = NexusUserStreamService.fetchByIds({ user_ids: ['bob'], viewer_id: 'viewer-b', depth: 1 });
      const otherDepth = NexusUserStreamService.fetchByIds({ user_ids: ['bob'], viewer_id: 'viewer-a', depth: 2 });
      const publicRead = NexusUserStreamService.fetchByIds({ user_ids: ['bob'], depth: 1 });
      running.resolve(nexusResponse([{ details: { id: 'bob' } }]));

      expect(await first).toEqual([{ details: { id: 'bob' } }]);
      expect(await Promise.all([otherViewer, otherDepth, publicRead])).toEqual([[], [], []]);
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('isolates overlapping posts by attachment metadata options', async () => {
      const running = Promise.withResolvers<Response>();
      mockFetch.mockReturnValueOnce(running.promise).mockResolvedValueOnce(nexusResponse([]));
      const withMetadata = NexusPostStreamService.fetchByIds({ post_ids: ['alice:one', 'bob:two'] });
      const withoutMetadata = NexusPostStreamService.fetchByIds({
        post_ids: ['bob:two'],
        include_attachment_metadata: false,
      });
      running.resolve(nexusResponse([{ details: { author: 'bob', id: 'two' } }]));

      await withMetadata;
      expect(await withoutMetadata).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not use an older overlapping batch for a forced user refresh', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
      const running = Promise.withResolvers<Response>();
      mockFetch
        .mockReturnValueOnce(running.promise)
        .mockResolvedValueOnce(nexusResponse([{ details: { id: 'bob', name: 'New name' } }]));
      try {
        const old = NexusUserStreamService.fetchByIds({ user_ids: ['alice', 'bob'] });
        now.mockReturnValue(2_000);
        const forced = NexusUserStreamService.fetchByIds({ user_ids: ['bob'], force: true });
        const refreshed = await forced;
        expect(refreshed).toEqual([{ details: { id: 'bob', name: 'New name' } }]);
        expect(getNexusResponseStartedAt(refreshed)).toBe(2_000);
        running.resolve(nexusResponse([{ details: { id: 'bob', name: 'Old name' } }]));
        expect(await old).toEqual([{ details: { id: 'bob', name: 'Old name' } }]);
        expect(mockFetch).toHaveBeenCalledTimes(2);
      } finally {
        now.mockRestore();
      }
    });

    describe.each(['users', 'posts'] as const)('exact %s queries before overlapping batches', (kind) => {
      beforeEach(() => {
        mockFetch.mockReset();
      });
      const ids = kind === 'users' ? ['alice', 'bob'] : ['alice:one', 'bob:two'];
      const record = (id: string, version: string) =>
        kind === 'users'
          ? { details: { id, name: version } }
          : { details: { author: id.split(':')[0], id: id.split(':')[1], content: version } };
      const fetchIds = (requested: string[], force = false) =>
        kind === 'users'
          ? NexusUserStreamService.fetchByIds({ user_ids: requested, force })
          : NexusPostStreamService.fetchByIds({ post_ids: requested, force });
      const exactQueryKey = () => [
        'nexus',
        `${getNexusUrl()}/v0/stream/${kind}/by_ids`,
        HttpMethod.POST,
        JSON.stringify(
          kind === 'users' ? { user_ids: [ids[1]] } : { post_ids: [ids[1]], include_attachment_metadata: true },
        ),
      ];

      it.each(['older record', 'omitted record'])(
        'returns the completed exact refresh before a pending batch with an %s',
        async (olderResult) => {
          const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
          const running = Promise.withResolvers<Response>();
          const refreshedRecords = [record(ids[1], 'Refreshed')];
          mockFetch.mockReturnValueOnce(running.promise).mockResolvedValueOnce(nexusResponse(refreshedRecords));
          const old = fetchIds(ids);
          now.mockReturnValue(2_000);
          const refreshed = await fetchIds([ids[1]], true);
          now.mockReturnValue(3_000);
          const resolved = vi.fn();
          const ordinary = fetchIds([ids[1]]).then(resolved);
          try {
            await vi.waitFor(() => expect(resolved).toHaveBeenCalledOnce());
            expect(resolved.mock.calls[0][0]).toBe(refreshed);
            expect(getNexusResponseStartedAt(resolved.mock.calls[0][0])).toBe(2_000);
            expect(mockFetch).toHaveBeenCalledTimes(2);
          } finally {
            running.resolve(nexusResponse(olderResult === 'older record' ? [record(ids[1], 'Older')] : []));
            await Promise.all([old, ordinary]);
            now.mockRestore();
          }
        },
      );

      it.each(['pending', 'settled'])(
        'preserves active batch ownership when an exact cache-hit promise is %s',
        async (cachedState) => {
          const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
          const thirdId = kind === 'users' ? 'carol' : 'carol:three';
          const running = Promise.withResolvers<Response>();
          mockFetch
            .mockResolvedValueOnce(nexusResponse([record(ids[1], 'Cached')]))
            .mockReturnValueOnce(running.promise)
            .mockResolvedValueOnce(nexusResponse([record(thirdId, 'Third')]));
          const cached = await fetchIds([ids[1]]);
          now.mockReturnValue(2_000);
          const old = fetchIds(ids);
          now.mockReturnValue(3_000);
          const exact = fetchIds([ids[1]]);
          if (cachedState === 'settled') await exact;
          const overlap = fetchIds([ids[1], thirdId]);
          try {
            await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
            const requested = JSON.parse(mockFetch.mock.calls[2][1].body);
            expect(requested[kind === 'users' ? 'user_ids' : 'post_ids']).toEqual([thirdId]);
            expect(await exact).toBe(cached);
            expect(getNexusResponseStartedAt(await exact)).toBe(1_000);
          } finally {
            running.resolve(nexusResponse([record(ids[1], 'Active batch')]));
            await Promise.all([old, exact, overlap]);
            now.mockRestore();
          }
          expect(await overlap).toEqual([record(ids[1], 'Active batch'), record(thirdId, 'Third')]);
          expect(getNexusResponseStartedAt(await overlap)).toBe(2_000);
        },
      );

      it.each(['fetching', 'paused'] as const)(
        'preserves active batch ownership when a fresh exact query is also %s',
        async (fetchStatus) => {
          const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
          const thirdId = kind === 'users' ? 'carol' : 'carol:three';
          const running = Promise.withResolvers<Response>();
          const refreshing = Promise.withResolvers<Response>();
          mockFetch
            .mockResolvedValueOnce(nexusResponse([record(ids[1], 'Cached')]))
            .mockReturnValueOnce(running.promise)
            .mockReturnValueOnce(refreshing.promise)
            .mockResolvedValueOnce(nexusResponse([record(thirdId, 'Third')]));
          const cached = await fetchIds([ids[1]]);
          now.mockReturnValue(2_000);
          const old = fetchIds(ids);
          nexusQueryClient.mount();
          if (fetchStatus === 'paused') onlineManager.setOnline(false);
          now.mockReturnValue(3_000);
          const forced = fetchIds([ids[1]], true);
          let overlap: ReturnType<typeof fetchIds> | undefined;
          try {
            await vi.waitFor(() =>
              expect(nexusQueryClient.getQueryState(exactQueryKey())?.fetchStatus).toBe(fetchStatus),
            );
            const exact = await fetchIds([ids[1]]);
            expect(exact).toBe(cached);
            expect(getNexusResponseStartedAt(exact)).toBe(1_000);
            onlineManager.setOnline(true);
            await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
            overlap = fetchIds([ids[1], thirdId]);
            await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(4));
            const requested = JSON.parse(mockFetch.mock.calls[3][1].body);
            expect(requested[kind === 'users' ? 'user_ids' : 'post_ids']).toEqual([thirdId]);
          } finally {
            onlineManager.setOnline(true);
            running.resolve(nexusResponse([record(ids[1], 'Active batch')]));
            refreshing.resolve(nexusResponse([record(ids[1], 'Forced')]));
            await Promise.all([old, forced, overlap]);
            nexusQueryClient.unmount();
            now.mockRestore();
          }
          expect(await overlap).toEqual([record(ids[1], 'Active batch'), record(thirdId, 'Third')]);
        },
      );

      it('keeps a cached missing slice out of the pending registry during a forced refresh', async () => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
        const thirdId = kind === 'users' ? 'carol' : 'carol:three';
        const running = Promise.withResolvers<Response>();
        const refreshing = Promise.withResolvers<Response>();
        mockFetch
          .mockResolvedValueOnce(nexusResponse([record(ids[1], 'Cached')]))
          .mockReturnValueOnce(running.promise)
          .mockReturnValueOnce(refreshing.promise)
          .mockResolvedValueOnce(nexusResponse([record(ids[1], 'New batch'), record(thirdId, 'Third')]));
        await fetchIds([ids[1]]);
        now.mockReturnValue(2_000);
        const old = fetchIds([ids[0]]);
        now.mockReturnValue(3_000);
        const forced = fetchIds([ids[1]], true);
        await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
        now.mockReturnValue(4_000);
        const assembling = fetchIds(ids);
        const overlap = fetchIds([ids[1], thirdId]);
        try {
          await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(4));
          const requested = JSON.parse(mockFetch.mock.calls[3][1].body);
          expect(requested[kind === 'users' ? 'user_ids' : 'post_ids']).toEqual([ids[1], thirdId]);
          expect(await overlap).toEqual([record(ids[1], 'New batch'), record(thirdId, 'Third')]);
          expect(getNexusResponseStartedAt(await overlap)).toBe(4_000);
        } finally {
          running.resolve(nexusResponse([record(ids[0], 'Other')]));
          refreshing.resolve(nexusResponse([record(ids[1], 'Forced')]));
          await Promise.all([old, forced, assembling, overlap]);
          now.mockRestore();
        }
        expect(await assembling).toEqual([record(ids[0], 'Other'), record(ids[1], 'Cached')]);
        expect(getNexusResponseStartedAt(await assembling)).toBe(1_000);
      });

      it('shares an actual paused exact refetch after it resumes', async () => {
        const refreshing = Promise.withResolvers<Response>();
        mockFetch
          .mockResolvedValueOnce(nexusResponse([record(ids[1], 'Cached')]))
          .mockReturnValueOnce(refreshing.promise)
          .mockResolvedValueOnce(nexusResponse([record(ids[0], 'Other')]));
        await fetchIds([ids[1]]);
        await nexusQueryClient.invalidateQueries({ queryKey: exactQueryKey(), exact: true });
        nexusQueryClient.mount();
        onlineManager.setOnline(false);
        const exact = fetchIds([ids[1]]);
        let overlap: ReturnType<typeof fetchIds> | undefined;
        try {
          await vi.waitFor(() => expect(nexusQueryClient.getQueryState(exactQueryKey())?.fetchStatus).toBe('paused'));
          onlineManager.setOnline(true);
          await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
          overlap = fetchIds(ids);
          await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
          const requested = JSON.parse(mockFetch.mock.calls[2][1].body);
          expect(requested[kind === 'users' ? 'user_ids' : 'post_ids']).toEqual([ids[0]]);
        } finally {
          onlineManager.setOnline(true);
          refreshing.resolve(nexusResponse([record(ids[1], 'Refreshed')]));
          await Promise.all([exact, overlap]);
          nexusQueryClient.unmount();
        }
        expect(await overlap).toEqual([record(ids[0], 'Other'), record(ids[1], 'Refreshed')]);
      });

      it.each(['stale', 'invalidated'])(
        'revalidates the %s exact response instead of joining an older overlapping batch',
        async (state) => {
          const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
          const running = Promise.withResolvers<Response>();
          mockFetch
            .mockResolvedValueOnce(nexusResponse([record(ids[1], 'Cached')]))
            .mockReturnValueOnce(running.promise)
            .mockResolvedValueOnce(nexusResponse([record(ids[1], 'Revalidated')]));
          await fetchIds([ids[1]]);
          now.mockReturnValue(2_000);
          const old = fetchIds(ids);
          if (state === 'stale') now.mockReturnValue(30_000);
          else await nexusQueryClient.invalidateQueries({ queryKey: exactQueryKey(), exact: true });
          const resolved = vi.fn();
          const ordinary = fetchIds([ids[1]]).then(resolved);
          try {
            await vi.waitFor(() => expect(resolved).toHaveBeenCalledOnce());
            expect(resolved.mock.calls[0][0]).toEqual([record(ids[1], 'Revalidated')]);
            expect(mockFetch).toHaveBeenCalledTimes(3);
          } finally {
            running.resolve(nexusResponse([record(ids[1], 'Older')]));
            await Promise.all([old, ordinary]);
            now.mockRestore();
          }
        },
      );

      it.each(['stale', 'invalidated'])('shares an exact %s refetch with a later overlapping batch', async (state) => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
        const refreshing = Promise.withResolvers<Response>();
        mockFetch
          .mockResolvedValueOnce(nexusResponse([record(ids[1], 'Cached')]))
          .mockReturnValueOnce(refreshing.promise)
          .mockResolvedValueOnce(nexusResponse([record(ids[0], 'Other')]));
        await fetchIds([ids[1]]);
        if (state === 'stale') now.mockReturnValue(30_000);
        else await nexusQueryClient.invalidateQueries({ queryKey: exactQueryKey(), exact: true });
        const exact = fetchIds([ids[1]]);
        await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
        const overlap = fetchIds(ids);
        try {
          await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
          const requested = JSON.parse(mockFetch.mock.calls[2][1].body);
          expect(requested[kind === 'users' ? 'user_ids' : 'post_ids']).toEqual([ids[0]]);
        } finally {
          refreshing.resolve(nexusResponse([record(ids[1], 'Refreshed')]));
          await Promise.all([exact, overlap]);
          now.mockRestore();
        }
        expect(await overlap).toEqual([record(ids[0], 'Other'), record(ids[1], 'Refreshed')]);
      });

      it.each(['updated', 'omitted'])(
        'keeps each selected batch authoritative when its newer record is %s',
        async (newerResult) => {
          const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
          const thirdId = kind === 'users' ? 'carol' : 'carol:three';
          const running = Promise.withResolvers<Response>();
          const refreshing = Promise.withResolvers<Response>();
          mockFetch
            .mockResolvedValueOnce(nexusResponse([record(ids[1], 'Cached')]))
            .mockReturnValueOnce(running.promise)
            .mockReturnValueOnce(refreshing.promise)
            .mockResolvedValueOnce(nexusResponse([record(ids[0], 'Other')]));
          await fetchIds([ids[1]]);
          now.mockReturnValue(2_000);
          const old = fetchIds([ids[1], thirdId]);
          now.mockReturnValue(30_000);
          const exact = fetchIds([ids[1]]);
          await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
          now.mockReturnValue(31_000);
          const overlap = fetchIds([...ids, thirdId]);
          const newer = newerResult === 'updated' ? [record(ids[1], 'Refreshed')] : [];
          refreshing.resolve(nexusResponse(newer));
          running.resolve(nexusResponse([record(ids[1], 'Older'), record(thirdId, 'Third')]));
          try {
            const [, , result] = await Promise.all([old, exact, overlap]);
            expect(result).toEqual([record(ids[0], 'Other'), ...newer, record(thirdId, 'Third')]);
            expect(getNexusResponseStartedAt(result)).toBe(2_000);
            expect(mockFetch).toHaveBeenCalledTimes(4);
          } finally {
            now.mockRestore();
          }
        },
      );

      it('joins a pending exact forced refresh instead of an older overlapping batch', async () => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
        const running = Promise.withResolvers<Response>();
        const refreshing = Promise.withResolvers<Response>();
        mockFetch.mockReturnValueOnce(running.promise).mockReturnValueOnce(refreshing.promise);
        const old = fetchIds(ids);
        now.mockReturnValue(2_000);
        const forced = fetchIds([ids[1]], true);
        await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
        now.mockReturnValue(3_000);
        const resolved = vi.fn();
        const ordinary = fetchIds([ids[1]]).then(resolved);
        refreshing.resolve(nexusResponse([record(ids[1], 'Refreshed')]));
        const refreshed = await forced;
        try {
          await vi.waitFor(() => expect(resolved).toHaveBeenCalledOnce());
          expect(resolved.mock.calls[0][0]).toBe(refreshed);
          expect(getNexusResponseStartedAt(resolved.mock.calls[0][0])).toBe(2_000);
          expect(mockFetch).toHaveBeenCalledTimes(2);
        } finally {
          running.resolve(nexusResponse([record(ids[1], 'Older')]));
          await Promise.all([old, ordinary]);
          now.mockRestore();
        }
      });
    });

    it('releases shared failed batches so a later caller can retry', async () => {
      const running = Promise.withResolvers<Response>();
      mockFetch.mockReturnValueOnce(running.promise).mockResolvedValueOnce(nexusResponse([{ details: { id: 'bob' } }]));
      const original = NexusUserStreamService.fetchByIds({ user_ids: ['alice', 'bob'] });
      const joined = NexusUserStreamService.fetchByIds({ user_ids: ['bob'] });
      const failures = Promise.allSettled([original, joined]);
      running.resolve(new Response('Bad request', { status: 400 }));

      expect((await failures).map((result) => result.status)).toEqual(['rejected', 'rejected']);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(await NexusUserStreamService.fetchByIds({ user_ids: ['bob'] })).toEqual([{ details: { id: 'bob' } }]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not join requests removed by a query-cache clear before their promises settle', async () => {
      const { nexusQueryClient } = await import('./nexus.query-client');
      const running = Promise.withResolvers<Response>();
      mockFetch
        .mockReturnValueOnce(running.promise)
        .mockResolvedValueOnce(nexusResponse([{ details: { id: 'bob', name: 'New session' } }]));
      const old = NexusUserStreamService.fetchByIds({ user_ids: ['alice', 'bob'] });
      const oldResult = Promise.allSettled([old]);
      nexusQueryClient.clear();
      const current = NexusUserStreamService.fetchByIds({ user_ids: ['bob'] });
      running.resolve(nexusResponse([{ details: { id: 'bob', name: 'Old session' } }]));

      expect(await current).toEqual([{ details: { id: 'bob', name: 'New session' } }]);
      expect((await oldResult)[0].status).toBe('rejected');
      expect(mockFetch).toHaveBeenCalledTimes(2);
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

  describe('queryNexus not-found budget', () => {
    const mockFetch = vi.fn();
    const originalFetch = globalThis.fetch;

    /** A syntactically valid pubky that Nexus does not know (valid-format unknown key). */
    const unknownPubky = 'pperrr8wsbpr3ue9d4qj41ge1kcc6r7fdiy6o3ugjrrhi4y77rdo';
    const detailsUrl = (suffix = '') => `${getNexusUrl()}/v0/user/${unknownPubky}/details${suffix}`;

    const notFoundResponse = () => new Response('Not Found', { status: 404 });

    beforeEach(async () => {
      vi.clearAllMocks();
      globalThis.fetch = mockFetch;
      const { nexusQueryClient } = await import('./nexus.query-client');
      nexusQueryClient.clear();
      vi.useFakeTimers();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.useRealTimers();
    });

    it('gives up on an unknown profile after the scoped 404 budget, not the shared one', async () => {
      mockFetch.mockImplementation(() => Promise.resolve(notFoundResponse()));

      const pending = queryNexus({ url: detailsUrl(), notFoundRetries: 2 });
      const rejection = expect(pending).rejects.toMatchObject({
        category: ErrorCategory.Client,
        code: ClientErrorCode.NOT_FOUND,
      });

      // Attempts at 0ms, 500ms, 1500ms - then the not-found verdict, ~1.5s total.
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(500);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      await rejection;

      // Never a fourth attempt: the page is not parked behind the 15.5s indexing window.
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('keeps the shared 404 budget for callers that do not scope one', async () => {
      mockFetch.mockImplementation(() => Promise.resolve(notFoundResponse()));

      const pending = queryNexus({ url: detailsUrl('-unscoped') });
      const rejection = expect(pending).rejects.toMatchObject({ code: ClientErrorCode.NOT_FOUND });

      // At 1.5s both budgets have made three attempts; only the scoped one is done.
      await vi.advanceTimersByTimeAsync(1_500);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      await vi.advanceTimersByTimeAsync(20_000);
      await rejection;
      expect(mockFetch).toHaveBeenCalledTimes(6);
    });

    it.each([true, false])('keeps concurrent retry budgets separate (profile first: %s)', async (profileFirst) => {
      const startedAt = Date.now();
      const details = { id: unknownPubky, name: 'Indexed after two seconds' };
      mockFetch.mockImplementation(() =>
        Promise.resolve(Date.now() - startedAt < 2_000 ? notFoundResponse() : new Response(JSON.stringify(details))),
      );
      const url = detailsUrl();
      const profile = () => queryNexus({ url, notFoundRetries: 2 });
      const background = () => queryNexus({ url });
      const first = profileFirst ? profile() : background();
      // Attach rejection handlers before advancing fake timers.
      const firstResult = first.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(0);
      const second = profileFirst ? background() : profile();
      const secondResult = second.catch((error: unknown) => error);
      let backgroundSettled = false;
      void (profileFirst ? secondResult : firstResult).then(() => {
        backgroundSettled = true;
      });

      await vi.advanceTimersByTimeAsync(1_500);
      expect(await (profileFirst ? firstResult : secondResult)).toMatchObject({ code: ClientErrorCode.NOT_FOUND });
      expect(backgroundSettled).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(6);

      await vi.advanceTimersByTimeAsync(2_000);
      expect(await (profileFirst ? secondResult : firstResult)).toEqual(details);
      expect(mockFetch).toHaveBeenCalledTimes(7);
    });

    it('still resolves a profile that gets indexed during the scoped retries', async () => {
      const details = { id: 'some-pubky', name: 'Newly Indexed' };
      mockFetch.mockResolvedValueOnce(notFoundResponse()).mockResolvedValue(new Response(JSON.stringify(details)));

      const pending = queryNexus({ url: detailsUrl('-indexed-later'), notFoundRetries: 2 });

      await vi.advanceTimersByTimeAsync(500);
      expect(await pending).toEqual(details);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('keeps the transient 5xx budget when a 404 budget is scoped', async () => {
      mockFetch.mockImplementation(() => Promise.resolve(new Response('Unavailable', { status: 503 })));

      const pending = queryNexus({ url: detailsUrl('-transient'), notFoundRetries: 2 });
      const rejection = expect(pending).rejects.toMatchObject({ category: ErrorCategory.Server });

      // serverError backoff is 1s/2s/4s: attempts at 0ms, 1000ms, 3000ms, 7000ms.
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(10_000);
      await rejection;
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });
});
