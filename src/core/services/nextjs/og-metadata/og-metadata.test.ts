import { describe, it, expect, vi, beforeEach } from 'vitest';
import { URL_TRUNCATE_LENGTH, TITLE_TRUNCATE_LENGTH } from '@/config';
import { asOpaque } from '@/test-utils';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockValidateDns, mockReadResponseBody, mockNormalizeImageUrl } = vi.hoisted(() => ({
  mockValidateDns: vi.fn(),
  mockReadResponseBody: vi.fn(),
  mockNormalizeImageUrl: vi.fn(),
}));

vi.mock('../nextjs.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../nextjs.utils')>();
  return {
    ...actual,
    validateDns: mockValidateDns,
    readResponseBody: mockReadResponseBody,
    normalizeImageUrl: mockNormalizeImageUrl,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

const simpleHtml = (title: string, image?: string) => {
  const imageTag = image ? `<meta property="og:image" content="${image}" />` : '';
  return `<!DOCTYPE html><html><head><meta property="og:title" content="${title}" />${imageTag}</head><body></body></html>`;
};

const createOkResponse = (contentType: string) =>
  new Response(null, { status: 200, headers: { 'content-type': contentType } });

const createErrorResponse = (status: number) => {
  const response = new Response(null, { status, headers: { 'content-type': 'text/html' } });
  Object.defineProperty(response, 'ok', { value: false });
  return response;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NextJsOgMetadataService', () => {
  let NextJsOgMetadataService: typeof import('./og-metadata').NextJsOgMetadataService;
  let Libs: typeof import('@/libs');

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    global.fetch = mockFetch;
    mockValidateDns.mockResolvedValue(undefined);
    mockNormalizeImageUrl.mockResolvedValue(null);

    const mod = await import('./og-metadata');
    Libs = await import('@/libs');
    NextJsOgMetadataService = mod.NextJsOgMetadataService;
  });

  // -------------------------------------------------------------------------
  // Orchestration: calls validateDns → fetch → readResponseBody
  // -------------------------------------------------------------------------

  it('should call validateDns with the hostname from the validated URL', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test'));

    await NextJsOgMetadataService.fetch(new URL('https://example.com/'));

    expect(mockValidateDns).toHaveBeenCalledWith('example.com');
  });

  it('should call fetch with the URL string', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test'));

    await NextJsOgMetadataService.fetch(new URL('https://example.com/page'));

    expect(mockFetch).toHaveBeenCalledWith('https://example.com/page', expect.objectContaining({ redirect: 'manual' }));
  });

  // -------------------------------------------------------------------------
  // Content type detection (media types + validateHtmlContentType)
  // -------------------------------------------------------------------------

  it('should return type "image" for image content type', async () => {
    mockFetch.mockResolvedValue(createOkResponse('image/png'));

    const result = await NextJsOgMetadataService.fetch(new URL('https://example.com/pic.png'));

    expect(result).toEqual({ url: 'https://example.com/pic.png', type: 'image' });
  });

  it('should return type "video" for video content type', async () => {
    mockFetch.mockResolvedValue(createOkResponse('video/mp4'));

    const result = await NextJsOgMetadataService.fetch(new URL('https://example.com/vid.mp4'));

    expect(result).toEqual({ url: 'https://example.com/vid.mp4', type: 'video' });
  });

  it('should return type "audio" for audio content type', async () => {
    mockFetch.mockResolvedValue(createOkResponse('audio/mpeg'));

    const result = await NextJsOgMetadataService.fetch(new URL('https://example.com/song.mp3'));

    expect(result).toEqual({ url: 'https://example.com/song.mp3', type: 'audio' });
  });

  it('should throw for non-HTML, non-media content type', async () => {
    mockFetch.mockResolvedValue(createOkResponse('application/json'));

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/api'))).rejects.toMatchObject({
      category: Libs.ErrorCategory.Validation,
      code: Libs.ValidationErrorCode.INVALID_INPUT,
      message: 'Not HTML content',
    });
  });

  // -------------------------------------------------------------------------
  // Error response handling (handleErrorResponse)
  // -------------------------------------------------------------------------

  it('should return fallback metadata for 403 responses', async () => {
    mockFetch.mockResolvedValue(createErrorResponse(403));

    const result = await NextJsOgMetadataService.fetch(new URL('https://example.com/blocked'));

    expect(result).toEqual({
      url: 'https://example.com/blocked',
      title: null,
      image: null,
      type: 'website',
    });
  });

  it('should throw for non-403 error responses', async () => {
    mockFetch.mockResolvedValue(createErrorResponse(500));

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/fail'))).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // HTML parsing & metadata extraction
  // -------------------------------------------------------------------------

  it('should extract og:title from HTML', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('My Page Title'));

    const result = await NextJsOgMetadataService.fetch(new URL('https://example.com/'));

    expect(result.title).toBe('My Page Title');
    expect(result.type).toBe('website');
  });

  it('should fallback to <title> tag when og:title is missing', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(
      '<!DOCTYPE html><html><head><title>Fallback</title></head><body></body></html>',
    );

    const result = await NextJsOgMetadataService.fetch(new URL('https://example.com/'));

    expect(result.title).toBe('Fallback');
  });

  it('should decode HTML entities in title', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(
      '<!DOCTYPE html><html><head><meta property="og:title" content="A &amp; B" /></head></html>',
    );

    const result = await NextJsOgMetadataService.fetch(new URL('https://example.com/'));

    expect(result.title).toBe('A & B');
  });

  it('should return null title when no title is found', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue('<!DOCTYPE html><html><head></head><body></body></html>');

    const result = await NextJsOgMetadataService.fetch(new URL('https://example.com/'));

    expect(result.title).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Image normalization
  // -------------------------------------------------------------------------

  it('should call normalizeImageUrl when og:image is found', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test', '/img.png'));
    mockNormalizeImageUrl.mockResolvedValue('https://example.com/img.png');

    const result = await NextJsOgMetadataService.fetch(new URL('https://example.com/'));

    expect(mockNormalizeImageUrl).toHaveBeenCalledWith('/img.png', 'https://example.com/');
    expect(result.image).toBe('https://example.com/img.png');
  });

  it('should not call normalizeImageUrl when og:image is missing', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test'));

    const result = await NextJsOgMetadataService.fetch(new URL('https://example.com/'));

    expect(mockNormalizeImageUrl).not.toHaveBeenCalled();
    expect(result.image).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Truncation
  // -------------------------------------------------------------------------

  it('should truncate long URLs with middle ellipsis', async () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(200);
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test'));

    const result = await NextJsOgMetadataService.fetch(new URL(longUrl));

    expect(result.url).toContain('...');
    expect(result.url.length).toBeLessThanOrEqual(URL_TRUNCATE_LENGTH);
  });

  it('should truncate long titles with trailing ellipsis', async () => {
    const longTitle = 'A'.repeat(200);
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml(longTitle));

    const result = await NextJsOgMetadataService.fetch(new URL('https://example.com/'));

    expect(result.title).toContain('...');
    expect(result.title!.length).toBe(TITLE_TRUNCATE_LENGTH + '...'.length);
  });

  // -------------------------------------------------------------------------
  // Redirect following (fetchWithRedirects)
  // -------------------------------------------------------------------------

  it('should abort fetch when request exceeds timeout', async () => {
    // Mock setTimeout to invoke the callback immediately to trigger abort.
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: TimerHandler) => {
      if (typeof fn === 'function') fn();
      return asOpaque<ReturnType<typeof setTimeout>>(0);
    });

    mockFetch.mockImplementation(() => {
      return Promise.reject(new DOMException('The operation was aborted', 'AbortError'));
    });

    await expect(NextJsOgMetadataService.fetch(new URL('https://slow.test/page'))).rejects.toMatchObject({
      category: Libs.ErrorCategory.Timeout,
    });

    vi.mocked(globalThis.setTimeout).mockRestore();
  });

  it('should clear timeout after successful fetch', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test'));

    await NextJsOgMetadataService.fetch(new URL('https://example.com/'));

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('should block redirects to non-HTTP protocols', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'ftp://example.test/data' } }),
    );

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/'))).rejects.toMatchObject({
      category: Libs.ErrorCategory.Auth,
      code: Libs.AuthErrorCode.FORBIDDEN,
      context: { protocol: 'ftp:', statusCode: Libs.HttpStatusCode.FORBIDDEN },
    });
  });

  it('should throw when exceeding max redirects', async () => {
    for (let i = 0; i < 5; i++) {
      mockFetch.mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: `https://example.test/r${i}` } }),
      );
    }

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/'))).rejects.toMatchObject({
      category: Libs.ErrorCategory.Network,
      code: Libs.NetworkErrorCode.CONNECTION_FAILED,
      message: 'Too many redirects',
    });
  });

  it('should return response when redirect has no Location header', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 301 }));
    // 301 without location is treated as final response; it's not ok → non-403 error
    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/'))).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // Error wrapping
  // -------------------------------------------------------------------------

  it('should re-throw AppError as-is', async () => {
    const appError = new Libs.AppError({
      category: Libs.ErrorCategory.Network,
      code: Libs.NetworkErrorCode.DNS_FAILED,
      message: 'DNS failed',
      service: Libs.ErrorService.NextJsServer,
      operation: 'validateDns',
    });
    mockValidateDns.mockRejectedValue(appError);

    const error = await NextJsOgMetadataService.fetch(new URL('https://example.com/')).catch((e: unknown) => e);

    expect(error).toBe(appError); // exact same reference
  });

  it('should wrap raw errors into server AppError with cause', async () => {
    const rawError = new TypeError('unexpected');
    mockValidateDns.mockRejectedValue(rawError);

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/'))).rejects.toMatchObject({
      category: Libs.ErrorCategory.Server,
      code: Libs.ServerErrorCode.UNKNOWN_ERROR,
      cause: rawError,
      context: { url: 'https://example.com/', statusCode: Libs.HttpStatusCode.INTERNAL_SERVER_ERROR },
    });
  });
});
