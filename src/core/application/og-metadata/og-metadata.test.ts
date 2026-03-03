import { describe, it, expect, vi, beforeEach } from 'vitest';
import { URL_TRUNCATE_LENGTH, TITLE_TRUNCATE_LENGTH } from '@/config';

// Create stable mock references via vi.hoisted so they're shared
// between the vi.mock factories and the test assertions
const { mockResolve4, mockIsIP, mockIsIpSafe } = vi.hoisted(() => ({
  mockResolve4: vi.fn<(hostname: string) => Promise<string[]>>(),
  mockIsIP: vi.fn<(input: string) => number>(),
  mockIsIpSafe: vi.fn<(ip: string) => boolean>(),
}));

vi.mock('dns/promises', () => ({
  default: { resolve4: mockResolve4 },
  resolve4: mockResolve4,
}));

vi.mock('net', () => ({
  default: { isIP: mockIsIP },
  isIP: mockIsIP,
}));

vi.mock('@/libs/network', () => ({
  isIpSafe: mockIsIpSafe,
}));

// Helpers for creating mock responses
const createMockReader = (chunks: Uint8Array[]) => {
  let index = 0;
  return {
    read: vi.fn().mockImplementation(() => {
      if (index < chunks.length) {
        return Promise.resolve({ done: false, value: chunks[index++] });
      }
      return Promise.resolve({ done: true, value: undefined });
    }),
    cancel: vi.fn(),
  };
};

const createHtmlResponse = (html: string, headers: Record<string, string> = {}) => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'content-type': 'text/html', ...headers }),
  body: {
    getReader: () => createMockReader([new TextEncoder().encode(html)]),
  },
});

const createMediaResponse = (contentType: string) => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'content-type': contentType }),
  body: { getReader: () => createMockReader([]) },
});

const createErrorResponse = (status: number) => ({
  ok: false,
  status,
  headers: new Headers({ 'content-type': 'text/html' }),
});

const simpleHtml = (title: string, image?: string) => {
  const imageTag = image ? `<meta property="og:image" content="${image}" />` : '';
  return `<!DOCTYPE html><html><head><meta property="og:title" content="${title}" />${imageTag}</head><body></body></html>`;
};

describe('OgMetadataApplication', () => {
  let OgMetadataApplication: typeof import('./og-metadata').OgMetadataApplication;
  let Core: typeof import('@/core');
  let Libs: typeof import('@/libs');

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Default mocks: hostname resolves to safe public IP
    mockIsIP.mockReturnValue(0);
    mockResolve4.mockResolvedValue(['1.1.1.1']);
    mockIsIpSafe.mockReturnValue(true);

    // Re-import modules after reset so all references are fresh
    Core = await import('@/core');
    Libs = await import('@/libs');
    OgMetadataApplication = Core.OgMetadataApplication;

    // Mock NextJsApiService.fetch
    vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue(
      createHtmlResponse(simpleHtml('Test Title')) as unknown as Response,
    );
  });

  describe('DNS validation', () => {
    it('should resolve hostname via DNS and proceed', async () => {
      mockResolve4.mockResolvedValue(['1.1.1.1']);

      const result = await OgMetadataApplication.fetch(new URL('https://example.com'));

      expect(mockResolve4).toHaveBeenCalledWith('example.com');
      expect(result.type).toBe('website');
    });

    it('should throw on empty DNS result', async () => {
      mockResolve4.mockResolvedValue([]);

      await expect(OgMetadataApplication.fetch(new URL('https://example.com'))).rejects.toThrow(
        'DNS resolution failed',
      );
    });

    it('should throw on DNS resolution failure', async () => {
      mockResolve4.mockRejectedValue(new Error('ENOTFOUND'));

      await expect(OgMetadataApplication.fetch(new URL('https://example.com'))).rejects.toThrow(
        'DNS resolution failed',
      );
    });

    it('should use IP directly when hostname is an IP address', async () => {
      mockIsIP.mockReturnValue(4);
      mockIsIpSafe.mockReturnValue(true);

      await OgMetadataApplication.fetch(new URL('http://1.1.1.1'));

      expect(mockResolve4).not.toHaveBeenCalled();
    });
  });

  describe('SSRF protection', () => {
    const privateIps = [
      { ip: '127.0.0.1', label: 'localhost' },
      { ip: '10.0.0.1', label: 'private 10.x' },
      { ip: '172.16.0.1', label: 'private 172.16.x' },
      { ip: '192.168.1.1', label: 'private 192.168.x' },
      { ip: '169.254.169.254', label: 'link-local (AWS metadata)' },
      { ip: '100.64.0.1', label: 'carrier-grade NAT' },
      { ip: '0.0.0.0', label: 'zero address' },
    ];

    for (const { ip, label } of privateIps) {
      it(`should block ${label} (${ip})`, async () => {
        mockResolve4.mockResolvedValue([ip]);
        mockIsIpSafe.mockReturnValue(false);

        await expect(OgMetadataApplication.fetch(new URL('https://example.com'))).rejects.toThrow('Blocked IP range');
      });
    }

    it('should block direct IP address that is unsafe', async () => {
      mockIsIP.mockReturnValue(4);
      mockIsIpSafe.mockReturnValue(false);

      await expect(OgMetadataApplication.fetch(new URL('http://127.0.0.1'))).rejects.toThrow('Blocked IP range');
    });
  });

  describe('fetch error handling', () => {
    it('should return fallback metadata when upstream responds with 403', async () => {
      vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue(createErrorResponse(403) as unknown as Response);

      const result = await OgMetadataApplication.fetch(new URL('https://example.com/events/123'));

      expect(result).toEqual({
        url: 'https://example.com/events/123',
        title: null,
        image: null,
        type: 'website',
      });
    });

    it('should throw for non-403 error status codes', async () => {
      vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue(createErrorResponse(500) as unknown as Response);

      await expect(OgMetadataApplication.fetch(new URL('https://example.com'))).rejects.toThrow('Fetch failed');
    });

    it('should throw for 404 status code', async () => {
      vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue(createErrorResponse(404) as unknown as Response);

      await expect(OgMetadataApplication.fetch(new URL('https://example.com'))).rejects.toThrow('Fetch failed');
    });
  });

  describe('content type detection', () => {
    it('should return type "image" for image content', async () => {
      vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue(
        createMediaResponse('image/png') as unknown as Response,
      );

      const result = await OgMetadataApplication.fetch(new URL('http://example.com/image.png'));

      expect(result).toEqual({ url: 'http://example.com/image.png', type: 'image' });
    });

    it('should return type "video" for video content', async () => {
      vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue(
        createMediaResponse('video/mp4') as unknown as Response,
      );

      const result = await OgMetadataApplication.fetch(new URL('http://example.com/video.mp4'));

      expect(result).toEqual({ url: 'http://example.com/video.mp4', type: 'video' });
    });

    it('should return type "audio" for audio content', async () => {
      vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue(
        createMediaResponse('audio/mpeg') as unknown as Response,
      );

      const result = await OgMetadataApplication.fetch(new URL('http://example.com/audio.mp3'));

      expect(result).toEqual({ url: 'http://example.com/audio.mp3', type: 'audio' });
    });

    it('should reject non-HTML content type', async () => {
      vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue(
        createMediaResponse('application/json') as unknown as Response,
      );

      await expect(OgMetadataApplication.fetch(new URL('http://example.com/api'))).rejects.toThrow('Not HTML content');
    });

    it('should accept text/html content type', async () => {
      vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue(
        createHtmlResponse(simpleHtml('Test')) as unknown as Response,
      );

      const result = await OgMetadataApplication.fetch(new URL('http://example.com'));

      expect(result.type).toBe('website');
    });
  });

  describe('response size limit', () => {
    it('should throw 413 for responses larger than 5MB', async () => {
      const largeChunk = new Uint8Array(6 * 1024 * 1024);
      vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        body: { getReader: () => createMockReader([largeChunk]) },
      } as unknown as Response);

      try {
        await OgMetadataApplication.fetch(new URL('http://example.com'));
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Libs.AppError);
        const appError = error as InstanceType<typeof Libs.AppError>;
        expect(appError.message).toContain('Response too large');
        expect(appError.context?.statusCode).toBe(413);
      }
    });
  });

  describe('HTML parsing', () => {
    it('should extract og:title from meta tag', async () => {
      vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue(
        createHtmlResponse(simpleHtml('Example Title')) as unknown as Response,
      );

      const result = await OgMetadataApplication.fetch(new URL('http://example.com'));

      expect(result.title).toBe('Example Title');
    });

    it('should fallback to <title> tag when og:title is missing', async () => {
      const html = '<!DOCTYPE html><html><head><title>Fallback Title</title></head><body></body></html>';
      vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue(createHtmlResponse(html) as unknown as Response);

      const result = await OgMetadataApplication.fetch(new URL('http://example.com'));

      expect(result.title).toBe('Fallback Title');
    });

    it('should decode HTML entities in title', async () => {
      const html =
        '<!DOCTYPE html><html><head><meta property="og:title" content="Test &quot;quotes&quot; &amp; &lt;tags&gt; &#39;apostrophe&#39;" /></head><body></body></html>';
      vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue(createHtmlResponse(html) as unknown as Response);

      const result = await OgMetadataApplication.fetch(new URL('http://example.com'));

      expect(result.title).toBe('Test "quotes" & <tags> \'apostrophe\'');
    });

    it('should return null title when no title is found', async () => {
      const html = '<!DOCTYPE html><html><head></head><body></body></html>';
      vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue(createHtmlResponse(html) as unknown as Response);

      const result = await OgMetadataApplication.fetch(new URL('http://example.com'));

      expect(result.title).toBeNull();
    });
  });

  describe('image URL normalization', () => {
    it('should normalize relative image URLs to absolute', async () => {
      // Both main URL and image URL DNS resolve to safe IPs
      mockResolve4.mockResolvedValue(['1.1.1.1']);

      vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue(
        createHtmlResponse(simpleHtml('Test', '/images/og-image.jpg')) as unknown as Response,
      );

      const result = await OgMetadataApplication.fetch(new URL('http://example.com/article'));

      expect(result.image).toBe('http://example.com/images/og-image.jpg');
    });

    it('should block file:// protocol in image URLs', async () => {
      vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue(
        createHtmlResponse(simpleHtml('Test', 'file:///etc/passwd')) as unknown as Response,
      );

      const result = await OgMetadataApplication.fetch(new URL('http://example.com'));

      expect(result.image).toBeNull();
    });

    it('should block image URLs that resolve to private IPs (SSRF)', async () => {
      // Main URL resolves to safe IP; image URL resolves to private IP
      mockResolve4
        .mockResolvedValueOnce(['1.1.1.1']) // main URL
        .mockResolvedValueOnce(['192.168.1.1']); // image URL
      mockIsIpSafe.mockReturnValueOnce(true).mockReturnValueOnce(false);

      vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue(
        createHtmlResponse(simpleHtml('Test', 'http://example.com/pic.jpg')) as unknown as Response,
      );

      const result = await OgMetadataApplication.fetch(new URL('http://example.com'));

      expect(result.title).toBe('Test');
      expect(result.image).toBeNull();
    });

    it('should return null when image DNS resolution fails', async () => {
      mockResolve4
        .mockResolvedValueOnce(['1.1.1.1']) // main URL
        .mockRejectedValueOnce(new Error('ENOTFOUND')); // image URL

      vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue(
        createHtmlResponse(simpleHtml('Test', 'http://no-resolve.com/pic.jpg')) as unknown as Response,
      );

      const result = await OgMetadataApplication.fetch(new URL('http://example.com'));

      expect(result.image).toBeNull();
    });
  });

  describe('truncation', () => {
    it('should truncate long URLs with middle ellipsis', async () => {
      const longUrl =
        'https://example.com/very/long/path/that/needs/to/be/truncated/because/it/is/too/long/for/display';

      vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue(
        createHtmlResponse(simpleHtml('Test')) as unknown as Response,
      );

      const result = await OgMetadataApplication.fetch(new URL(longUrl));

      expect(result.url).toContain('...');
      expect(result.url.length).toBeLessThanOrEqual(URL_TRUNCATE_LENGTH);
    });

    it('should not truncate short URLs', async () => {
      const shortUrl = 'https://example.com/short';

      vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue(
        createHtmlResponse(simpleHtml('Test')) as unknown as Response,
      );

      const result = await OgMetadataApplication.fetch(new URL(shortUrl));

      expect(result.url).toBe(shortUrl);
    });

    it('should truncate long titles with trailing ellipsis', async () => {
      const longTitle =
        'This is a very long title that should be truncated because it exceeds the maximum length allowed';
      vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue(
        createHtmlResponse(simpleHtml(longTitle)) as unknown as Response,
      );

      const result = await OgMetadataApplication.fetch(new URL('http://example.com'));

      expect(result.title).toContain('...');
      expect(result.title!.length).toBe(TITLE_TRUNCATE_LENGTH + '...'.length);
      expect(result.title!.endsWith('...')).toBe(true);
    });

    it('should not truncate short titles', async () => {
      vi.spyOn(Core.NextJsApiService, 'fetch').mockResolvedValue(
        createHtmlResponse(simpleHtml('Short Title')) as unknown as Response,
      );

      const result = await OgMetadataApplication.fetch(new URL('http://example.com'));

      expect(result.title).toBe('Short Title');
    });
  });

  describe('error wrapping', () => {
    it('should wrap unexpected errors in AppError', async () => {
      vi.spyOn(Core.NextJsApiService, 'fetch').mockRejectedValue(new TypeError('unexpected'));

      try {
        await OgMetadataApplication.fetch(new URL('http://example.com'));
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Libs.AppError);
        const appError = error as InstanceType<typeof Libs.AppError>;
        expect(appError.message).toBe('Failed to fetch OG metadata');
        expect(appError.category).toBe(Libs.ErrorCategory.Server);
        expect(appError.context?.statusCode).toBe(500);
      }
    });

    it('should re-throw AppErrors without wrapping', async () => {
      const originalError = Libs.Err.auth(Libs.AuthErrorCode.FORBIDDEN, 'Blocked IP range', {
        service: Libs.ErrorService.NextJsApi,
        operation: 'validateDns',
        context: { statusCode: 403 },
      });
      vi.spyOn(Core.NextJsApiService, 'fetch').mockRejectedValue(originalError);

      await expect(OgMetadataApplication.fetch(new URL('http://example.com'))).rejects.toThrow(originalError);
    });
  });
});
