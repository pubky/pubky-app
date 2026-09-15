import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCdnUrl, getNexusUrl } from '@/config/nexus';
import { ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { parseResponseOrThrow } from '@/libs/http/response.utils';
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
});
