import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TOgMetadataResult } from '@/application/og-metadata/og-metadata.types';
import { OgMetadataController } from '@/controllers/og-metadata/og-metadata';
import { AuthErrorCode, ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { GET } from './route';

const createRequest = (url: string) => {
  const searchParams = new URLSearchParams({ url });
  return new NextRequest(`http://localhost:3000/api/og-metadata?${searchParams.toString()}`, {
    method: 'GET',
  });
};

const createRequestWithoutUrl = () => {
  return new NextRequest('http://localhost:3000/api/og-metadata', { method: 'GET' });
};

const mockMetadata: TOgMetadataResult = {
  url: 'https://example.com',
  type: 'website',
  title: 'Example Title',
  image: 'https://example.com/image.jpg',
};

describe('API Route: /api/og-metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(OgMetadataController, 'fetch').mockResolvedValue({
      ok: true,
      metadata: mockMetadata,
    });
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
      const fetchSpy = vi.spyOn(OgMetadataController, 'fetch');
      const request = createRequest('https://example.com/test');

      await GET(request);

      expect(fetchSpy).toHaveBeenCalledWith({ url: 'https://example.com/test' });
    });

    it('should pass null url to controller when param is missing', async () => {
      const fetchSpy = vi.spyOn(OgMetadataController, 'fetch');
      const request = createRequestWithoutUrl();

      await GET(request);

      expect(fetchSpy).toHaveBeenCalledWith({ url: null });
    });

    it('should return 400 for validation failures', async () => {
      vi.spyOn(OgMetadataController, 'fetch').mockResolvedValue({
        ok: false,
        message: 'Invalid URL',
        statusCode: HttpStatusCode.BAD_REQUEST,
      });

      const request = createRequest('');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid URL');
    });

    it('should return 403 for AppError with statusCode 403', async () => {
      const appError = Err.auth(AuthErrorCode.FORBIDDEN, 'Blocked IP range', {
        service: ErrorService.NextJsServer,
        operation: 'checkDnsSafety',
        context: { statusCode: HttpStatusCode.FORBIDDEN },
      });
      vi.spyOn(OgMetadataController, 'fetch').mockRejectedValue(appError);

      const request = createRequest('http://localhost');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Blocked IP range');
    });

    it('should return 413 for AppError with statusCode 413', async () => {
      const appError = Err.client(ClientErrorCode.PAYLOAD_TOO_LARGE, 'Response too large (max 5MB)', {
        service: ErrorService.NextJsServer,
        operation: 'readResponseBody',
        context: { statusCode: HttpStatusCode.PAYLOAD_TOO_LARGE },
      });
      vi.spyOn(OgMetadataController, 'fetch').mockRejectedValue(appError);

      const request = createRequest('https://huge-page.com');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(413);
      expect(data.error).toBe('Response too large (max 5MB)');
    });

    it('should return 500 for unexpected errors', async () => {
      vi.spyOn(OgMetadataController, 'fetch').mockRejectedValue(new Error('Unexpected'));

      const request = createRequest('https://example.com');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });
  });
});
