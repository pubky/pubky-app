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
  clearInFlightQueriesForTest,
  createFetchOptions,
  queryNexus,
  queryNexusDeduped,
} from './nexus.utils';

describe('nexus.utils', () => {
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
    it('should create GET options with default headers', () => {
      const result = createFetchOptions({ method: HttpMethod.GET });
      expect(result.method).toBe('GET');
      expect(result.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(result.body).toBeUndefined();
    });

    it('should create POST options with body', () => {
      const body = JSON.stringify({ key: 'value' });
      const result = createFetchOptions({ method: HttpMethod.POST, body });
      expect(result.method).toBe('POST');
      expect(result.body).toBe(body);
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

describe('queryNexusDeduped', () => {
  const mockFetch = vi.fn();
  const createMockResponse = (overrides: Record<string, unknown> = {}) => ({
    ok: true,
    status: 200,
    headers: { get: vi.fn() },
    text: vi.fn().mockResolvedValue(''),
    ...overrides,
  });

  beforeEach(async () => {
    clearInFlightQueriesForTest();
    vi.clearAllMocks();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('coalesces concurrent identical requests into one fetch and removes the entry on settle', async () => {
    const url = 'https://example.com/api/batch';
    const body = JSON.stringify({ ids: ['a', 'b'] });
    let resolveFetch!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    mockFetch.mockReturnValueOnce(pending);

    const p1 = queryNexusDeduped({ url, method: HttpMethod.POST, body });
    const p2 = queryNexusDeduped({ url, method: HttpMethod.POST, body });

    // Second concurrent caller must share the first's promise: only one fetch.
    resolveFetch(createMockResponse({ text: vi.fn().mockResolvedValue(JSON.stringify({ ok: true })) }));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ ok: true });
    expect(r2).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Within TanStack's staleTime a settled success is served from the query
    // cache regardless of the dedupe map; the map's own removal is exercised
    // by the rejection test below (errors are never cached).
  });

  it('starts a fresh request after a rejection (no poisoned entries)', async () => {
    const url = 'https://example.com/api/batch-fail';
    const body = JSON.stringify({ ids: ['x'] });

    // 400 is non-retryable in the nexus client config, so it rejects immediately
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: { get: vi.fn() },
      text: vi.fn().mockResolvedValue(''),
    });
    await expect(queryNexusDeduped({ url, method: HttpMethod.POST, body })).rejects.toMatchObject({
      category: ErrorCategory.Client,
      code: ClientErrorCode.BAD_REQUEST,
    });

    mockFetch.mockResolvedValueOnce(
      createMockResponse({ text: vi.fn().mockResolvedValue(JSON.stringify({ recovered: true })) }),
    );
    const r = await queryNexusDeduped({ url, method: HttpMethod.POST, body });
    expect(r).toEqual({ recovered: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
