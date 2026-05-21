import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TOgMetadataFetchOutcome, TOgMetadataResult } from '@/application/og-metadata/og-metadata.types';
import { TITLE_TRUNCATE_LENGTH, URL_TRUNCATE_LENGTH } from '@/config/urls';
import { AuthErrorCode, NetworkErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { asOpaque } from '@/test-utils/type-assertions';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockReadResponseBody, mockResolve4, mockIsIP, mockIsIpSafe } = vi.hoisted(() => ({
  mockReadResponseBody: vi.fn(),
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

vi.mock('@/libs/network/network', () => ({
  isIpSafe: mockIsIpSafe,
}));

vi.mock('../nextjs.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../nextjs.utils')>();
  return {
    ...actual,
    readResponseBody: mockReadResponseBody,
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

const createDnsError = (code = 'ENOTFOUND') => Object.assign(new Error(code), { code });

const expectMetadataResult = (outcome: TOgMetadataFetchOutcome): TOgMetadataResult => {
  if (outcome.kind === 'transient-fallback') throw new Error('Expected metadata outcome');
  return outcome.metadata;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NextJsOgMetadataService', () => {
  let NextJsOgMetadataService: typeof import('./og-metadata').NextJsOgMetadataService;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    global.fetch = mockFetch;
    mockResolve4.mockResolvedValue(['1.1.1.1']);
    mockIsIP.mockReturnValue(0);
    mockIsIpSafe.mockReturnValue(true);
    const mod = await import('./og-metadata');
    NextJsOgMetadataService = mod.NextJsOgMetadataService;
  });

  // -------------------------------------------------------------------------
  // Orchestration: calls DNS validation → fetch → readResponseBody
  // -------------------------------------------------------------------------

  it('should resolve DNS for the hostname from the validated URL', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test'));

    await NextJsOgMetadataService.fetch(new URL('https://example.com/'));

    expect(mockResolve4).toHaveBeenCalledWith('example.com');
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

    const result = expectMetadataResult(await NextJsOgMetadataService.fetch(new URL('https://example.com/pic.png')));

    expect(result).toEqual({ url: 'https://example.com/pic.png', type: 'image' });
  });

  it('should return type "video" for video content type', async () => {
    mockFetch.mockResolvedValue(createOkResponse('video/mp4'));

    const result = expectMetadataResult(await NextJsOgMetadataService.fetch(new URL('https://example.com/vid.mp4')));

    expect(result).toEqual({ url: 'https://example.com/vid.mp4', type: 'video' });
  });

  it('should return type "audio" for audio content type', async () => {
    mockFetch.mockResolvedValue(createOkResponse('audio/mpeg'));

    const result = expectMetadataResult(await NextJsOgMetadataService.fetch(new URL('https://example.com/song.mp3')));

    expect(result).toEqual({ url: 'https://example.com/song.mp3', type: 'audio' });
  });

  it('should return durable fallback for non-HTML, non-media content type', async () => {
    mockFetch.mockResolvedValue(createOkResponse('application/json'));

    const result = await NextJsOgMetadataService.fetch(new URL('https://example.com/api'));

    expect(result).toEqual({
      kind: 'durable-fallback',
      metadata: {
        url: 'https://example.com/api',
        title: null,
        image: null,
        type: 'website',
      },
      fallbackReason: 'non_html',
      cachePolicy: 'normal',
    });
  });

  // -------------------------------------------------------------------------
  // Error response handling (handleErrorResponse)
  // -------------------------------------------------------------------------

  it('should return fallback metadata for 403 responses', async () => {
    mockFetch.mockResolvedValue(createErrorResponse(403));

    const result = await NextJsOgMetadataService.fetch(new URL('https://example.com/blocked'));

    expect(result).toEqual({
      kind: 'durable-fallback',
      metadata: {
        url: 'https://example.com/blocked',
        title: null,
        image: null,
        type: 'website',
      },
      fallbackReason: 'http_error',
      cachePolicy: 'normal',
    });
  });

  it('should return durable fallback metadata for 404 responses', async () => {
    mockFetch.mockResolvedValue(createErrorResponse(404));

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/missing'))).resolves.toMatchObject({
      kind: 'durable-fallback',
      fallbackReason: 'http_error',
      cachePolicy: 'normal',
      metadata: {
        url: 'https://example.com/missing',
        title: null,
        image: null,
        type: 'website',
      },
    });
  });

  it('should return durable fallback metadata for 410 responses', async () => {
    mockFetch.mockResolvedValue(createErrorResponse(410));

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/gone'))).resolves.toMatchObject({
      kind: 'durable-fallback',
      fallbackReason: 'http_error',
      cachePolicy: 'normal',
      metadata: {
        url: 'https://example.com/gone',
        title: null,
        image: null,
        type: 'website',
      },
    });
  });

  it('should return transient rate-limit fallback for 429 responses', async () => {
    mockFetch.mockResolvedValue(createErrorResponse(429));

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/rate-limited'))).resolves.toMatchObject({
      kind: 'transient-fallback',
      fallbackReason: 'rate_limit',
      statusCode: HttpStatusCode.TOO_MANY_REQUESTS,
      cachePolicy: 'no-store',
    });
  });

  it('should return transient fallback for remote 500 responses', async () => {
    mockFetch.mockResolvedValue(createErrorResponse(500));

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/fail'))).resolves.toMatchObject({
      kind: 'transient-fallback',
      fallbackReason: 'http_error',
      statusCode: HttpStatusCode.SERVICE_UNAVAILABLE,
      cachePolicy: 'no-store',
    });
  });

  it('should return transient timeout fallback for remote 504 responses', async () => {
    mockFetch.mockResolvedValue(createErrorResponse(504));

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/gateway-timeout'))).resolves.toMatchObject({
      kind: 'transient-fallback',
      fallbackReason: 'timeout',
      statusCode: HttpStatusCode.REQUEST_TIMEOUT,
      cachePolicy: 'no-store',
    });
  });

  // -------------------------------------------------------------------------
  // HTML parsing & metadata extraction
  // -------------------------------------------------------------------------

  it('should extract og:title from HTML', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('My Page Title'));

    const result = expectMetadataResult(await NextJsOgMetadataService.fetch(new URL('https://example.com/')));

    expect(result.title).toBe('My Page Title');
    expect(result.type).toBe('website');
  });

  it('should fallback to <title> tag when og:title is missing', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(
      '<!DOCTYPE html><html><head><title>Fallback</title></head><body></body></html>',
    );

    const result = expectMetadataResult(await NextJsOgMetadataService.fetch(new URL('https://example.com/')));

    expect(result.title).toBe('Fallback');
  });

  it('should decode HTML entities in title', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(
      '<!DOCTYPE html><html><head><meta property="og:title" content="A &amp; B" /></head></html>',
    );

    const result = expectMetadataResult(await NextJsOgMetadataService.fetch(new URL('https://example.com/')));

    expect(result.title).toBe('A & B');
  });

  it('should return null title when no title is found', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue('<!DOCTYPE html><html><head></head><body></body></html>');

    const result = expectMetadataResult(await NextJsOgMetadataService.fetch(new URL('https://example.com/')));

    expect(result.title).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Image normalization
  // -------------------------------------------------------------------------

  it('should normalize og:image when image URL is safe', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test', '/img.png'));

    const result = expectMetadataResult(await NextJsOgMetadataService.fetch(new URL('https://example.com/')));

    expect(result.image).toBe('https://example.com/img.png');
  });

  it('should return null image when og:image is missing', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test'));

    const result = expectMetadataResult(await NextJsOgMetadataService.fetch(new URL('https://example.com/')));

    expect(result.image).toBeNull();
  });

  it('should drop og:image when image DNS fails without failing page metadata', async () => {
    const errNetworkSpy = vi.spyOn(Err, 'network');
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test', 'https://cdn.example.test/img.png'));
    mockResolve4.mockResolvedValueOnce(['1.1.1.1']).mockRejectedValueOnce(createDnsError());

    const result = expectMetadataResult(await NextJsOgMetadataService.fetch(new URL('https://example.com/')));

    expect(result.title).toBe('Test');
    expect(result.image).toBeNull();
    expect(errNetworkSpy).not.toHaveBeenCalled();
  });

  it('should drop data og:image URLs without DNS lookup', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test', 'data:image/png;base64,abc123'));

    const result = expectMetadataResult(await NextJsOgMetadataService.fetch(new URL('https://example.com/')));

    expect(result.title).toBe('Test');
    expect(result.image).toBeNull();
    expect(mockResolve4).toHaveBeenCalledTimes(1);
    expect(mockResolve4).toHaveBeenCalledWith('example.com');
  });

  it('should drop malformed og:image URLs without DNS lookup', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test', 'http://[::1'));

    const result = expectMetadataResult(await NextJsOgMetadataService.fetch(new URL('https://example.com/')));

    expect(result.title).toBe('Test');
    expect(result.image).toBeNull();
    expect(mockResolve4).toHaveBeenCalledTimes(1);
    expect(mockResolve4).toHaveBeenCalledWith('example.com');
  });

  it('should drop private og:image IPs without failing page metadata', async () => {
    const errAuthSpy = vi.spyOn(Err, 'auth');
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test', 'http://169.254.169.254/img.png'));
    mockIsIP.mockReturnValueOnce(0).mockReturnValueOnce(4);
    mockIsIpSafe.mockReturnValueOnce(true).mockReturnValueOnce(false);

    const result = expectMetadataResult(await NextJsOgMetadataService.fetch(new URL('https://example.com/')));

    expect(result.title).toBe('Test');
    expect(result.image).toBeNull();
    expect(errAuthSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Truncation
  // -------------------------------------------------------------------------

  it('should truncate long URLs with middle ellipsis', async () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(200);
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test'));

    const result = expectMetadataResult(await NextJsOgMetadataService.fetch(new URL(longUrl)));

    expect(result.url).toContain('...');
    expect(result.url.length).toBeLessThanOrEqual(URL_TRUNCATE_LENGTH);
  });

  it('should truncate long titles with trailing ellipsis', async () => {
    const longTitle = 'A'.repeat(200);
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml(longTitle));

    const result = expectMetadataResult(await NextJsOgMetadataService.fetch(new URL('https://example.com/')));

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

    await expect(NextJsOgMetadataService.fetch(new URL('https://slow.test/page'))).resolves.toMatchObject({
      kind: 'transient-fallback',
      fallbackReason: 'timeout',
      statusCode: HttpStatusCode.REQUEST_TIMEOUT,
      cachePolicy: 'no-store',
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

  it('should return transient network fallback for raw fetch failures', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('ECONNRESET'));

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/'))).resolves.toMatchObject({
      kind: 'transient-fallback',
      fallbackReason: 'network',
      statusCode: HttpStatusCode.SERVICE_UNAVAILABLE,
      cachePolicy: 'no-store',
    });
  });

  it('should block redirects to non-HTTP protocols', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'ftp://example.test/data' } }),
    );

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/'))).rejects.toMatchObject({
      category: ErrorCategory.Auth,
      code: AuthErrorCode.FORBIDDEN,
      context: { protocol: 'ftp:', statusCode: HttpStatusCode.FORBIDDEN },
    });
  });

  it('should throw when exceeding max redirects', async () => {
    for (let i = 0; i < 5; i++) {
      mockFetch.mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: `https://example.test/r${i}` } }),
      );
    }

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/'))).rejects.toMatchObject({
      category: ErrorCategory.Network,
      code: NetworkErrorCode.CONNECTION_FAILED,
      message: 'Too many redirects',
    });
  });

  it('should return response when redirect has no Location header', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 301 }));
    // 301 without location is treated as final response; it's not ok → transient no-store outcome.
    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/'))).resolves.toMatchObject({
      kind: 'transient-fallback',
      fallbackReason: 'http_error',
      cachePolicy: 'no-store',
    });
  });

  // -------------------------------------------------------------------------
  // Error wrapping
  // -------------------------------------------------------------------------

  it('should return transient fallback for DNS failures without throwing', async () => {
    mockResolve4.mockRejectedValue(createDnsError());

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/'))).resolves.toMatchObject({
      kind: 'transient-fallback',
      fallbackReason: 'dns_failed',
      statusCode: HttpStatusCode.SERVICE_UNAVAILABLE,
      cachePolicy: 'no-store',
    });
  });

  it('should reject private main URL IPs before fetching', async () => {
    mockIsIP.mockReturnValue(4);
    mockIsIpSafe.mockReturnValue(false);

    await expect(NextJsOgMetadataService.fetch(new URL('http://169.254.169.254/'))).rejects.toMatchObject({
      category: ErrorCategory.Auth,
      code: AuthErrorCode.FORBIDDEN,
      context: { hostname: '169.254.169.254', statusCode: HttpStatusCode.FORBIDDEN },
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should keep unexpected DNS safety errors reportable', async () => {
    const rawError = new Error('resolver bug');
    mockResolve4.mockRejectedValue(rawError);

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/'))).rejects.toMatchObject({
      category: ErrorCategory.Server,
      code: ServerErrorCode.UNKNOWN_ERROR,
      cause: rawError,
      context: { url: 'https://example.com/', statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR },
    });
  });

  it('should wrap raw errors into server AppError with cause', async () => {
    const rawError = new TypeError('unexpected');
    mockReadResponseBody.mockRejectedValue(rawError);
    mockFetch.mockResolvedValue(createOkResponse('text/html'));

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/'))).rejects.toMatchObject({
      category: ErrorCategory.Server,
      code: ServerErrorCode.UNKNOWN_ERROR,
      cause: rawError,
      context: { url: 'https://example.com/', statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR },
    });
  });
});
