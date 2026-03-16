import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import * as Core from '@/core';
import * as Libs from '@/libs';

const createRequest = (url: string) => {
  const searchParams = new URLSearchParams({ url });
  return new NextRequest(`http://localhost:3000/api/og-metadata?${searchParams.toString()}`, {
    method: 'GET',
  });
};

const createRequestWithoutUrl = () => {
  return new NextRequest('http://localhost:3000/api/og-metadata', { method: 'GET' });
};

const mockMetadata: Core.TOgMetadataResult = {
  url: 'https://example.com',
  type: 'website',
  title: 'Example Title',
  image: 'https://example.com/image.jpg',
};

describe('API Route: /api/og-metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Core.OgMetadataController, 'fetch').mockResolvedValue(mockMetadata);
  });

  describe('GET', () => {
    it('should return 200 with metadata and cache headers on success', async () => {
      const request = createRequest('https://example.com');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockMetadata);
      expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=300, stale-while-revalidate=1800');
    });

    it('should not cache for more than 1 hour — stale metadata will persist too long on CDN', async () => {
      const request = createRequest('https://example.com');
      const response = await GET(request);

      const cacheControl = response.headers.get('Cache-Control') ?? '';
      const match = cacheControl.match(/s-maxage=(\d+)/);
      const sMaxAge = match ? Number(match[1]) : 0;

      expect(sMaxAge).toBeLessThanOrEqual(3600);
    });

    it('should pass url search param to controller', async () => {
      const fetchSpy = vi.spyOn(Core.OgMetadataController, 'fetch');
      const request = createRequest('https://example.com/test');

      await GET(request);

      expect(fetchSpy).toHaveBeenCalledWith({ url: 'https://example.com/test' });
    });

    it('should pass null url to controller when param is missing', async () => {
      const fetchSpy = vi.spyOn(Core.OgMetadataController, 'fetch');
      const request = createRequestWithoutUrl();

      await GET(request);

      expect(fetchSpy).toHaveBeenCalledWith({ url: null });
    });

    it('should return 400 for AppError with statusCode 400', async () => {
      const appError = Libs.Err.validation(Libs.ValidationErrorCode.MISSING_FIELD, 'Invalid URL', {
        service: Libs.ErrorService.NextJsServer,
        operation: 'validate',
        context: { field: 'url', statusCode: Libs.HttpStatusCode.BAD_REQUEST },
      });
      vi.spyOn(Core.OgMetadataController, 'fetch').mockRejectedValue(appError);

      const request = createRequest('');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid URL');
      expect(response.headers.get('Cache-Control')).toBeNull();
    });

    it('should return 403 for AppError with statusCode 403', async () => {
      const appError = Libs.Err.auth(Libs.AuthErrorCode.FORBIDDEN, 'Blocked IP range', {
        service: Libs.ErrorService.NextJsServer,
        operation: 'validateDns',
        context: { statusCode: Libs.HttpStatusCode.FORBIDDEN },
      });
      vi.spyOn(Core.OgMetadataController, 'fetch').mockRejectedValue(appError);

      const request = createRequest('http://localhost');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Blocked IP range');
    });

    it('should return 408 for AppError with statusCode 408', async () => {
      const appError = Libs.Err.timeout(Libs.TimeoutErrorCode.REQUEST_TIMEOUT, 'Request timeout', {
        service: Libs.ErrorService.NextJsServer,
        operation: 'fetchOgMetadata',
        context: { statusCode: Libs.HttpStatusCode.REQUEST_TIMEOUT },
      });
      vi.spyOn(Core.OgMetadataController, 'fetch').mockRejectedValue(appError);

      const request = createRequest('https://slow-site.com');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(408);
      expect(data.error).toBe('Request timeout');
    });

    it('should return 413 for AppError with statusCode 413', async () => {
      const appError = Libs.Err.client(Libs.ClientErrorCode.PAYLOAD_TOO_LARGE, 'Response too large (max 5MB)', {
        service: Libs.ErrorService.NextJsServer,
        operation: 'readResponseBody',
        context: { statusCode: Libs.HttpStatusCode.PAYLOAD_TOO_LARGE },
      });
      vi.spyOn(Core.OgMetadataController, 'fetch').mockRejectedValue(appError);

      const request = createRequest('https://huge-page.com');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(413);
      expect(data.error).toBe('Response too large (max 5MB)');
    });

    it('should return 500 for unexpected errors', async () => {
      vi.spyOn(Core.OgMetadataController, 'fetch').mockRejectedValue(new Error('Unexpected'));

      const request = createRequest('https://example.com');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });
  });
});
