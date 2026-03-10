import { describe, it, expect, vi, beforeEach } from 'vitest';
import { URL_TRUNCATE_LENGTH, TITLE_TRUNCATE_LENGTH } from '@/config';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockValidateDns, mockFetchWithRedirects, mockReadResponseBody, mockNormalizeImageUrl } = vi.hoisted(() => ({
  mockValidateDns: vi.fn(),
  mockFetchWithRedirects: vi.fn(),
  mockReadResponseBody: vi.fn(),
  mockNormalizeImageUrl: vi.fn(),
}));

vi.mock('../nextjs.utils', () => ({
  validateDns: mockValidateDns,
  fetchWithRedirects: mockFetchWithRedirects,
  readResponseBody: mockReadResponseBody,
  normalizeImageUrl: mockNormalizeImageUrl,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

describe('fetchOgMetadata', () => {
  let fetchOgMetadata: typeof import('./og-metadata.utils').fetchOgMetadata;
  let Libs: typeof import('@/libs');

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    mockValidateDns.mockResolvedValue(undefined);
    mockNormalizeImageUrl.mockResolvedValue(null);

    const mod = await import('./og-metadata.utils');
    Libs = await import('@/libs');
    fetchOgMetadata = mod.fetchOgMetadata;
  });

  // -------------------------------------------------------------------------
  // Orchestration: calls validateDns → fetchWithRedirects → readResponseBody
  // -------------------------------------------------------------------------

  it('should call validateDns with the provided hostname', async () => {
    mockFetchWithRedirects.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test'));

    await fetchOgMetadata('https://example.com/', 'example.com');

    expect(mockValidateDns).toHaveBeenCalledWith('example.com');
  });

  it('should call fetchWithRedirects with the provided URL', async () => {
    mockFetchWithRedirects.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test'));

    await fetchOgMetadata('https://example.com/page', 'example.com');

    expect(mockFetchWithRedirects).toHaveBeenCalledWith('https://example.com/page');
  });

  // -------------------------------------------------------------------------
  // Content type detection (media types)
  // -------------------------------------------------------------------------

  it('should return type "image" for image content type', async () => {
    mockFetchWithRedirects.mockResolvedValue(createOkResponse('image/png'));

    const result = await fetchOgMetadata('https://example.com/pic.png', 'example.com');

    expect(result).toEqual({ url: 'https://example.com/pic.png', type: 'image' });
  });

  it('should return type "video" for video content type', async () => {
    mockFetchWithRedirects.mockResolvedValue(createOkResponse('video/mp4'));

    const result = await fetchOgMetadata('https://example.com/vid.mp4', 'example.com');

    expect(result).toEqual({ url: 'https://example.com/vid.mp4', type: 'video' });
  });

  it('should return type "audio" for audio content type', async () => {
    mockFetchWithRedirects.mockResolvedValue(createOkResponse('audio/mpeg'));

    const result = await fetchOgMetadata('https://example.com/song.mp3', 'example.com');

    expect(result).toEqual({ url: 'https://example.com/song.mp3', type: 'audio' });
  });

  it('should throw for non-HTML, non-media content type', async () => {
    mockFetchWithRedirects.mockResolvedValue(createOkResponse('application/json'));

    await expect(fetchOgMetadata('https://example.com/api', 'example.com')).rejects.toMatchObject({
      category: Libs.ErrorCategory.Validation,
      code: Libs.ValidationErrorCode.INVALID_INPUT,
      message: 'Not HTML content',
    });
  });

  // -------------------------------------------------------------------------
  // Non-OK responses
  // -------------------------------------------------------------------------

  it('should return fallback metadata for 403 responses', async () => {
    mockFetchWithRedirects.mockResolvedValue(createErrorResponse(403));

    const result = await fetchOgMetadata('https://example.com/blocked', 'example.com');

    expect(result).toEqual({
      url: 'https://example.com/blocked',
      title: null,
      image: null,
      type: 'website',
    });
  });

  it('should throw for non-403 error responses', async () => {
    mockFetchWithRedirects.mockResolvedValue(createErrorResponse(500));

    await expect(fetchOgMetadata('https://example.com/fail', 'example.com')).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // HTML parsing & metadata extraction
  // -------------------------------------------------------------------------

  it('should extract og:title from HTML', async () => {
    mockFetchWithRedirects.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('My Page Title'));

    const result = await fetchOgMetadata('https://example.com/', 'example.com');

    expect(result.title).toBe('My Page Title');
    expect(result.type).toBe('website');
  });

  it('should fallback to <title> tag when og:title is missing', async () => {
    mockFetchWithRedirects.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(
      '<!DOCTYPE html><html><head><title>Fallback</title></head><body></body></html>',
    );

    const result = await fetchOgMetadata('https://example.com/', 'example.com');

    expect(result.title).toBe('Fallback');
  });

  it('should decode HTML entities in title', async () => {
    mockFetchWithRedirects.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(
      '<!DOCTYPE html><html><head><meta property="og:title" content="A &amp; B" /></head></html>',
    );

    const result = await fetchOgMetadata('https://example.com/', 'example.com');

    expect(result.title).toBe('A & B');
  });

  it('should return null title when no title is found', async () => {
    mockFetchWithRedirects.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue('<!DOCTYPE html><html><head></head><body></body></html>');

    const result = await fetchOgMetadata('https://example.com/', 'example.com');

    expect(result.title).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Image normalization
  // -------------------------------------------------------------------------

  it('should call normalizeImageUrl when og:image is found', async () => {
    mockFetchWithRedirects.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test', '/img.png'));
    mockNormalizeImageUrl.mockResolvedValue('https://example.com/img.png');

    const result = await fetchOgMetadata('https://example.com/', 'example.com');

    expect(mockNormalizeImageUrl).toHaveBeenCalledWith('/img.png', 'https://example.com/');
    expect(result.image).toBe('https://example.com/img.png');
  });

  it('should not call normalizeImageUrl when og:image is missing', async () => {
    mockFetchWithRedirects.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test'));

    const result = await fetchOgMetadata('https://example.com/', 'example.com');

    expect(mockNormalizeImageUrl).not.toHaveBeenCalled();
    expect(result.image).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Truncation
  // -------------------------------------------------------------------------

  it('should truncate long URLs with middle ellipsis', async () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(200);
    mockFetchWithRedirects.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test'));

    const result = await fetchOgMetadata(longUrl, 'example.com');

    expect(result.url).toContain('...');
    expect(result.url.length).toBeLessThanOrEqual(URL_TRUNCATE_LENGTH);
  });

  it('should truncate long titles with trailing ellipsis', async () => {
    const longTitle = 'A'.repeat(200);
    mockFetchWithRedirects.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml(longTitle));

    const result = await fetchOgMetadata('https://example.com/', 'example.com');

    expect(result.title).toContain('...');
    expect(result.title!.length).toBe(TITLE_TRUNCATE_LENGTH + '...'.length);
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

    const error = await fetchOgMetadata('https://example.com/', 'example.com').catch((e: unknown) => e);

    expect(error).toBe(appError); // exact same reference
  });

  it('should wrap raw errors into server AppError with cause', async () => {
    const rawError = new TypeError('unexpected');
    mockValidateDns.mockRejectedValue(rawError);

    await expect(fetchOgMetadata('https://example.com/', 'example.com')).rejects.toMatchObject({
      category: Libs.ErrorCategory.Server,
      code: Libs.ServerErrorCode.UNKNOWN_ERROR,
      cause: rawError,
      context: { url: 'https://example.com/', statusCode: Libs.HttpStatusCode.INTERNAL_SERVER_ERROR },
    });
  });
});
