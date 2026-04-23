import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Config from '@/config';
import {
  HttpMethod,
  ErrorCategory,
  ClientErrorCode,
  ServerErrorCode,
  ErrorService,
  parseResponseOrThrow,
} from '@/libs';
import { buildNexusUrl, buildCdnUrl, buildUrlWithQuery, createFetchOptions, queryNexus } from './nexus.utils';
import { mockResponse, asOpaque } from '@/test-utils';

describe('nexus.utils', () => {
  describe('buildNexusUrl', () => {
    it('should build correct Nexus URL', () => {
      expect(buildNexusUrl('v0/users')).toBe(`${Config.NEXUS_URL}/v0/users`);
    });
  });

  describe('buildCdnUrl', () => {
    it('should build correct CDN URL', () => {
      expect(buildCdnUrl('avatar/user123')).toBe(`${Config.CDN_URL}/avatar/user123`);
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
