import { createServer } from 'node:http';
import { fetch as undiciFetch } from 'undici';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TITLE_TRUNCATE_LENGTH, URL_TRUNCATE_LENGTH } from '@/config/urls';
import { AuthErrorCode, NetworkErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { asOpaque } from '@/test-utils/type-assertions';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockReadResponseBody, mockResolve4, mockResolve6, mockIsIP, mockIsIpSafe } = vi.hoisted(() => ({
  mockReadResponseBody: vi.fn(),
  mockResolve4: vi.fn<(hostname: string) => Promise<string[]>>(),
  mockResolve6: vi.fn<(hostname: string) => Promise<string[]>>(),
  mockIsIP: vi.fn<(input: string) => number>(),
  mockIsIpSafe: vi.fn<(ip: string) => boolean>(),
}));

vi.mock('dns/promises', () => ({
  default: { resolve4: mockResolve4, resolve6: mockResolve6 },
  resolve4: mockResolve4,
  resolve6: mockResolve6,
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
    // Tests stub the body text; the service consumes the reader's result shape, so a string stub
    // is wrapped as a successful read. Result objects and rejections pass through unchanged.
    readResponseBody: async (response: Response) => {
      const stubbed = await mockReadResponseBody(response);
      return typeof stubbed === 'string' ? { ok: true, body: stubbed } : stubbed;
    },
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

/** A response with a real body stream, so a test can assert the service releases the connection before retrying. */
const createCancellableResponse = (status: number, contentType: string) => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('<html></html>'));
    },
    cancel() {
      cancelled = true;
    },
  });
  const response = new Response(stream, { status, headers: { 'content-type': contentType } });
  Object.defineProperty(response, 'ok', { value: status < 400 });
  return { response, wasCancelled: () => cancelled };
};

/** Page whose head carries no Open Graph tags, as a client-rendered shell does for a bot-walled identity. */
const shellHtml = (title?: string) =>
  `<!DOCTYPE html><html><head>${title ? `<title>${title}</title>` : ''}</head><body><div id="root"></div></body></html>`;

const CRAWLER_USER_AGENT = 'facebookexternalhit/1.1';
const BOT_WALL_URL = 'https://www.reddit.com/r/Bitcoin/comments/15lu8ps/milk_sad/';

const createDnsError = (code = 'ENOTFOUND') => Object.assign(new Error(code), { code });
const EXPECTED_DNS_ERROR_CODES = [
  'ENOTFOUND',
  'ESERVFAIL',
  'ETIMEDOUT',
  'ETIMEOUT',
  'EAI_AGAIN',
  'ENODATA',
  'EREFUSED',
  'ECONNREFUSED',
  'ECANCELLED',
  'EDESTRUCTION',
];

const spyOnLoggerWarn = async () => {
  const { Logger } = await import('@/libs/logger/logger');
  return vi.spyOn(Logger, 'warn');
};

const spyOnLoggerError = async () => {
  const { Logger } = await import('@/libs/logger/logger');
  return vi.spyOn(Logger, 'error');
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NextJsOgMetadataService', () => {
  let NextJsOgMetadataService: typeof import('./og-metadata').NextJsOgMetadataService;

  beforeEach(async () => {
    vi.clearAllMocks();

    global.fetch = mockFetch;
    mockResolve4.mockResolvedValue(['1.1.1.1']);
    mockResolve6.mockResolvedValue([]);
    mockIsIP.mockImplementation((input) => {
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(input)) return 4;
      if (input.includes(':')) return 6;
      return 0;
    });
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
    expect(mockResolve6).toHaveBeenCalledWith('example.com');
  });

  it('should call fetch with the URL string', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test'));

    await NextJsOgMetadataService.fetch(new URL('https://example.com/page'));

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/page',
      expect.objectContaining({
        dispatcher: expect.anything(),
        redirect: 'manual',
      }),
    );
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

  it('should return durable fallback for non-HTML, non-media content type', async () => {
    const loggerWarnSpy = await spyOnLoggerWarn();
    mockFetch.mockResolvedValue(createOkResponse('application/json'));

    const result = await NextJsOgMetadataService.fetch(new URL('https://example.com/api'));

    expect(result).toEqual({
      url: 'https://example.com/api',
      title: null,
      image: null,
      type: 'website',
    });
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[og-metadata:fetch]',
      expect.objectContaining({
        outcome: 'fallback',
        reason: 'non_html',
        hostname: 'example.com',
        contentType: 'application/json',
      }),
    );
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

  it('should return durable fallback metadata for 404 responses', async () => {
    mockFetch.mockResolvedValue(createErrorResponse(404));

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/missing'))).resolves.toMatchObject({
      url: 'https://example.com/missing',
      title: null,
      image: null,
      type: 'website',
    });
  });

  it('should return durable fallback metadata for 410 responses', async () => {
    mockFetch.mockResolvedValue(createErrorResponse(410));

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/gone'))).resolves.toMatchObject({
      url: 'https://example.com/gone',
      title: null,
      image: null,
      type: 'website',
    });
  });

  it('should return fallback metadata for 429 responses', async () => {
    const loggerWarnSpy = await spyOnLoggerWarn();
    mockFetch.mockResolvedValue(createErrorResponse(429));

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/rate-limited'))).resolves.toMatchObject({
      url: 'https://example.com/rate-limited',
      title: null,
      image: null,
      type: 'website',
    });
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[og-metadata:fetch]',
      expect.objectContaining({
        outcome: 'fallback',
        reason: 'rate_limit',
        hostname: 'example.com',
        statusCode: 429,
      }),
    );
  });

  it('should return fallback metadata for remote 500 responses', async () => {
    const loggerWarnSpy = await spyOnLoggerWarn();
    mockFetch.mockResolvedValue(createErrorResponse(500));

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/fail'))).resolves.toMatchObject({
      url: 'https://example.com/fail',
      title: null,
      image: null,
      type: 'website',
    });
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[og-metadata:fetch]',
      expect.objectContaining({
        outcome: 'fallback',
        reason: 'http_error',
        hostname: 'example.com',
        statusCode: 500,
      }),
    );
  });

  it('should return fallback metadata for remote 504 responses', async () => {
    const loggerWarnSpy = await spyOnLoggerWarn();
    mockFetch.mockResolvedValue(createErrorResponse(504));

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/gateway-timeout'))).resolves.toMatchObject({
      url: 'https://example.com/gateway-timeout',
      title: null,
      image: null,
      type: 'website',
    });
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[og-metadata:fetch]',
      expect.objectContaining({
        outcome: 'fallback',
        reason: 'timeout',
        hostname: 'example.com',
        statusCode: 504,
      }),
    );
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

  it('should normalize og:image when image URL is safe', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test', '/img.png'));

    const result = await NextJsOgMetadataService.fetch(new URL('https://example.com/'));

    expect(result.image).toBe('https://example.com/img.png');
  });

  it('should return null image when og:image is missing', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test'));

    const result = await NextJsOgMetadataService.fetch(new URL('https://example.com/'));

    expect(result.image).toBeNull();
  });

  it('should drop og:image when image DNS fails without failing page metadata', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test', 'https://cdn.example.test/img.png'));
    mockResolve4.mockResolvedValueOnce(['1.1.1.1']).mockRejectedValueOnce(createDnsError());

    const result = await NextJsOgMetadataService.fetch(new URL('https://example.com/'));

    expect(result.title).toBe('Test');
    expect(result.image).toBeNull();
  });

  it('should drop data og:image URLs without DNS lookup', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test', 'data:image/png;base64,abc123'));

    const result = await NextJsOgMetadataService.fetch(new URL('https://example.com/'));

    expect(result.title).toBe('Test');
    expect(result.image).toBeNull();
    expect(mockResolve4).toHaveBeenCalledTimes(1);
    expect(mockResolve4).toHaveBeenCalledWith('example.com');
  });

  it('should drop malformed og:image URLs without DNS lookup', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test', 'http://[::1'));

    const result = await NextJsOgMetadataService.fetch(new URL('https://example.com/'));

    expect(result.title).toBe('Test');
    expect(result.image).toBeNull();
    expect(mockResolve4).toHaveBeenCalledTimes(1);
    expect(mockResolve4).toHaveBeenCalledWith('example.com');
  });

  it('should drop private og:image IPs without failing page metadata', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Test', 'http://169.254.169.254/img.png'));
    mockIsIP.mockReturnValueOnce(0).mockReturnValueOnce(4);
    mockIsIpSafe.mockReturnValueOnce(true).mockReturnValueOnce(false);

    const result = await NextJsOgMetadataService.fetch(new URL('https://example.com/'));

    expect(result.title).toBe('Test');
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
    const loggerWarnSpy = await spyOnLoggerWarn();
    const loggerErrorSpy = await spyOnLoggerError();
    // Mock setTimeout to invoke the callback immediately to trigger abort.
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: TimerHandler) => {
      if (typeof fn === 'function') fn();
      return asOpaque<ReturnType<typeof setTimeout>>(0);
    });

    mockFetch.mockImplementation(() => {
      return Promise.reject(new DOMException('The operation was aborted', 'AbortError'));
    });

    await expect(NextJsOgMetadataService.fetch(new URL('https://slow.test/page'))).resolves.toMatchObject({
      url: 'https://slow.test/page',
      title: null,
      image: null,
      type: 'website',
    });
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[og-metadata:fetch]',
      expect.objectContaining({
        outcome: 'fallback',
        reason: 'timeout',
        hostname: 'slow.test',
        errorName: 'AbortError',
      }),
    );
    expect(loggerErrorSpy).not.toHaveBeenCalled();

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

  it('should return fallback metadata for raw fetch failures', async () => {
    const loggerWarnSpy = await spyOnLoggerWarn();
    const loggerErrorSpy = await spyOnLoggerError();
    const rawError = new TypeError('ECONNRESET');
    mockFetch.mockRejectedValueOnce(rawError);

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/'))).resolves.toMatchObject({
      url: 'https://example.com/',
      title: null,
      image: null,
      type: 'website',
    });
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[og-metadata:fetch]',
      expect.objectContaining({
        outcome: 'fallback',
        reason: 'network',
        hostname: 'example.com',
        errorName: 'TypeError',
      }),
    );
    expect(loggerErrorSpy).not.toHaveBeenCalled();
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

  it('should fall back for redirects to unsafe IP literals without following them', async () => {
    const loggerWarnSpy = await spyOnLoggerWarn();
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://127.0.0.2/' } }));
    mockIsIpSafe.mockImplementation((ip) => ip !== '127.0.0.2');

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/'))).resolves.toEqual({
      url: 'http://127.0.0.2/',
      title: null,
      image: null,
      type: 'website',
    });
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[og-metadata:fetch]',
      expect.objectContaining({ outcome: 'fallback', reason: 'blocked_ip', hostname: '127.0.0.2' }),
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should fall back for a redirect hostname with an unsafe AAAA answer at connection time', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: 'http://redirect-rebind.example.test/' } }),
      )
      .mockImplementationOnce((input, init) =>
        undiciFetch(input as Parameters<typeof undiciFetch>[0], init as Parameters<typeof undiciFetch>[1]),
      );
    mockResolve4
      .mockResolvedValueOnce(['1.1.1.1'])
      .mockResolvedValueOnce(['1.1.1.1'])
      .mockResolvedValueOnce(['1.1.1.1']);
    mockResolve6.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce(['fd00::1']);
    mockIsIpSafe.mockImplementation((ip) => ip !== 'fd00::1');

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/'))).resolves.toEqual({
      url: 'http://redirect-rebind.example.test/',
      title: null,
      image: null,
      type: 'website',
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
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

  it('should return fallback metadata when redirect has no Location header', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 301 }));
    // 301 without location is treated as final response; it's not ok -> fallback metadata.
    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/'))).resolves.toMatchObject({
      url: 'https://example.com/',
      title: null,
      image: null,
      type: 'website',
    });
  });

  // -------------------------------------------------------------------------
  // Error wrapping
  // -------------------------------------------------------------------------

  it.each(EXPECTED_DNS_ERROR_CODES)('should return fallback metadata for expected DNS failure %s', async (code) => {
    const loggerWarnSpy = await spyOnLoggerWarn();
    mockResolve4.mockRejectedValue(createDnsError(code));

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/'))).resolves.toMatchObject({
      url: 'https://example.com/',
      title: null,
      image: null,
      type: 'website',
    });
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[og-metadata:fetch]',
      expect.objectContaining({
        outcome: 'fallback',
        reason: 'dns_failed',
        hostname: 'example.com',
      }),
    );
  });

  it.each(['http://127.0.0.2/', 'http://127.1.1.1/', 'http://169.254.169.254/', 'http://[::1]/'])(
    'should fall back for unsafe main URL IP %s before fetching',
    async (url) => {
      const loggerWarnSpy = await spyOnLoggerWarn();
      mockIsIpSafe.mockReturnValue(false);

      await expect(NextJsOgMetadataService.fetch(new URL(url))).resolves.toMatchObject({
        url,
        title: null,
        image: null,
        type: 'website',
      });
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        '[og-metadata:fetch]',
        expect.objectContaining({ outcome: 'fallback', reason: 'blocked_ip' }),
      );
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );

  it('should fall back when any resolved address is unsafe', async () => {
    const loggerWarnSpy = await spyOnLoggerWarn();
    mockResolve4.mockResolvedValueOnce(['1.1.1.1', '127.0.0.2']);
    mockIsIpSafe.mockImplementation((ip) => ip !== '127.0.0.2');

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/'))).resolves.toMatchObject({
      url: 'https://example.com/',
      title: null,
      image: null,
      type: 'website',
    });
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[og-metadata:fetch]',
      expect.objectContaining({ outcome: 'fallback', reason: 'blocked_ip', hostname: 'example.com' }),
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should fall back when an AAAA answer is unsafe', async () => {
    const loggerWarnSpy = await spyOnLoggerWarn();
    mockResolve6.mockResolvedValueOnce(['fd00::1']);
    mockIsIpSafe.mockImplementation((ip) => ip !== 'fd00::1');

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/'))).resolves.toMatchObject({
      url: 'https://example.com/',
      title: null,
      image: null,
      type: 'website',
    });
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[og-metadata:fetch]',
      expect.objectContaining({ outcome: 'fallback', reason: 'blocked_ip', hostname: 'example.com' }),
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should block when any connection-time DNS answer is unsafe', async () => {
    const loggerWarnSpy = await spyOnLoggerWarn();
    const loggerErrorSpy = await spyOnLoggerError();
    global.fetch = asOpaque<typeof global.fetch>(undiciFetch);
    mockResolve4.mockResolvedValueOnce(['1.1.1.1']).mockResolvedValueOnce(['1.1.1.1', '127.0.0.2']);
    mockIsIpSafe.mockImplementation((ip) => ip !== '127.0.0.2');

    await expect(NextJsOgMetadataService.fetch(new URL('http://rebind.example.test/'))).resolves.toEqual({
      url: 'http://rebind.example.test/',
      title: null,
      image: null,
      type: 'website',
    });
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[og-metadata:fetch]',
      expect.objectContaining({
        outcome: 'fallback',
        reason: 'blocked_ip',
        hostname: 'rebind.example.test',
        errorName: 'OgMetadataBlockedIpError',
      }),
    );
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it('should connect to the vetted address returned by the connection-time lookup', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(simpleHtml('Vetted destination'));
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');

      global.fetch = asOpaque<typeof global.fetch>(undiciFetch);
      mockResolve4.mockResolvedValue(['127.0.0.1']);
      mockIsIpSafe.mockReturnValue(true);
      mockReadResponseBody.mockImplementationOnce(async (response: Response) => response.text());

      await expect(
        NextJsOgMetadataService.fetch(new URL(`http://vetted.example.test:${address.port}/`)),
      ).resolves.toMatchObject({ title: 'Vetted destination' });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('should return fallback metadata when connection-time DNS resolution fails', async () => {
    const loggerWarnSpy = await spyOnLoggerWarn();
    const loggerErrorSpy = await spyOnLoggerError();
    global.fetch = asOpaque<typeof global.fetch>(undiciFetch);
    mockResolve4.mockResolvedValueOnce(['1.1.1.1']).mockRejectedValueOnce(createDnsError());

    await expect(NextJsOgMetadataService.fetch(new URL('http://dns-change.example.test/'))).resolves.toEqual({
      url: 'http://dns-change.example.test/',
      title: null,
      image: null,
      type: 'website',
    });
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[og-metadata:fetch]',
      expect.objectContaining({
        outcome: 'fallback',
        reason: 'dns_failed',
        hostname: 'dns-change.example.test',
        errorName: 'OgMetadataDnsError',
      }),
    );
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it('should keep unexpected DNS safety errors reportable', async () => {
    const rawError = new Error('resolver bug');
    mockResolve4.mockRejectedValue(rawError);

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/'))).rejects.toMatchObject({
      category: ErrorCategory.Server,
      code: ServerErrorCode.UNKNOWN_ERROR,
      operation: 'checkDnsSafety',
      cause: rawError,
      context: { hostname: 'example.com' },
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

  it.each(['body_too_large', 'body_timeout', 'body_unreadable'] as const)(
    'should return fallback metadata when the body read ends in %s',
    async (reason) => {
      const loggerWarnSpy = await spyOnLoggerWarn();
      mockFetch.mockResolvedValue(createOkResponse('text/html'));
      mockReadResponseBody.mockResolvedValue({ ok: false, reason });

      await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/'))).resolves.toEqual({
        url: 'https://example.com/',
        title: null,
        image: null,
        type: 'website',
      });
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        '[og-metadata:fetch]',
        expect.objectContaining({ outcome: 'fallback', reason, hostname: 'example.com' }),
      );
    },
  );

  // -------------------------------------------------------------------------
  // Crawler retry: bot walls (403/429) and Open-Graph-less 200 shells
  // -------------------------------------------------------------------------

  it('should retry once with a crawler identity when the browser identity hits a bot wall', async () => {
    const loggerWarnSpy = await spyOnLoggerWarn();
    const blocked = createCancellableResponse(HttpStatusCode.FORBIDDEN, 'text/html');
    mockFetch.mockResolvedValueOnce(blocked.response).mockResolvedValueOnce(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(
      simpleHtml('From the Bitcoin community on Reddit', 'https://share.redd.it/preview.png'),
    );

    const result = await NextJsOgMetadataService.fetch(new URL(BOT_WALL_URL));

    expect(result).toMatchObject({
      title: 'From the Bitcoin community on Reddit',
      image: 'https://share.redd.it/preview.png',
      type: 'website',
    });
    expect(result.url).toContain('reddit.com');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      BOT_WALL_URL,
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('Mozilla/5.0') }),
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      BOT_WALL_URL,
      expect.objectContaining({
        redirect: 'manual',
        dispatcher: expect.anything(),
        headers: expect.objectContaining({ 'User-Agent': CRAWLER_USER_AGENT }),
      }),
    );
    // The bot-wall body is released before the retry, so the retry does not queue behind a socket
    // the first response still holds.
    expect(blocked.wasCancelled()).toBe(true);
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[og-metadata:fetch]',
      expect.objectContaining({
        outcome: 'crawler_retry',
        trigger: 'bot_wall',
        recovered: true,
        hostname: 'www.reddit.com',
        statusCode: HttpStatusCode.FORBIDDEN,
      }),
    );
  });

  it('should retry once with a crawler identity when a 200 carries no Open Graph tags', async () => {
    const loggerWarnSpy = await spyOnLoggerWarn();
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody
      .mockResolvedValueOnce(shellHtml('Reddit - The heart of the internet'))
      .mockResolvedValueOnce(simpleHtml('Milk Sad'));

    const result = await NextJsOgMetadataService.fetch(new URL(BOT_WALL_URL));

    expect(result).toMatchObject({ title: 'Milk Sad' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[og-metadata:fetch]',
      expect.objectContaining({
        outcome: 'crawler_retry',
        trigger: 'empty_metadata',
        recovered: true,
        hostname: 'www.reddit.com',
        statusCode: 200,
      }),
    );
  });

  it('should retry once when a 200 page carries neither a title nor an image', async () => {
    const loggerWarnSpy = await spyOnLoggerWarn();
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValueOnce(shellHtml()).mockResolvedValueOnce(simpleHtml('Milk Sad'));

    await expect(NextJsOgMetadataService.fetch(new URL(BOT_WALL_URL))).resolves.toMatchObject({ title: 'Milk Sad' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[og-metadata:fetch]',
      expect.objectContaining({ outcome: 'fallback', reason: 'empty_metadata', hostname: 'www.reddit.com' }),
    );
  });

  it('should retry a 429 rate limit with the crawler identity', async () => {
    mockFetch
      .mockResolvedValueOnce(createErrorResponse(HttpStatusCode.TOO_MANY_REQUESTS))
      .mockResolvedValueOnce(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Recovered'));

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/rate-limited'))).resolves.toMatchObject({
      title: 'Recovered',
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should keep the first fallback when the crawler retry is bot-walled too', async () => {
    const loggerWarnSpy = await spyOnLoggerWarn();
    mockFetch.mockResolvedValue(createErrorResponse(HttpStatusCode.FORBIDDEN));

    const result = await NextJsOgMetadataService.fetch(new URL(BOT_WALL_URL));

    expect(result).toEqual({
      url: expect.stringContaining('reddit.com'),
      title: null,
      image: null,
      type: 'website',
    });
    // One retry, not a loop.
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[og-metadata:fetch]',
      expect.objectContaining({
        outcome: 'crawler_retry',
        trigger: 'bot_wall',
        recovered: false,
        hostname: 'www.reddit.com',
      }),
    );
  });

  it.each([HttpStatusCode.NOT_FOUND, HttpStatusCode.INTERNAL_SERVER_ERROR] as const)(
    'should not retry a %s response',
    async (status) => {
      mockFetch.mockResolvedValue(createErrorResponse(status));

      await NextJsOgMetadataService.fetch(new URL('https://example.com/missing'));

      expect(mockFetch).toHaveBeenCalledTimes(1);
    },
  );

  it('should not retry when the browser identity already gets usable metadata', async () => {
    mockFetch.mockResolvedValue(createOkResponse('text/html'));
    mockReadResponseBody.mockResolvedValue(simpleHtml('Real title', 'https://example.com/img.png'));

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/page'))).resolves.toMatchObject({
      title: 'Real title',
      image: 'https://example.com/img.png',
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should not retry a 200 that is not HTML', async () => {
    mockFetch.mockResolvedValue(createOkResponse('application/json'));

    await NextJsOgMetadataService.fetch(new URL('https://example.com/api'));

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should not retry a media response', async () => {
    mockFetch.mockResolvedValue(createOkResponse('image/png'));

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/pic.png'))).resolves.toMatchObject({
      type: 'image',
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should keep the SSRF guard on every hop of the crawler retry', async () => {
    const loggerWarnSpy = await spyOnLoggerWarn();
    mockFetch
      .mockResolvedValueOnce(createErrorResponse(HttpStatusCode.FORBIDDEN))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://127.0.0.2/' } }));
    mockIsIpSafe.mockImplementation((ip) => ip !== '127.0.0.2');

    await expect(NextJsOgMetadataService.fetch(new URL('https://example.com/blocked'))).resolves.toEqual({
      url: 'http://127.0.0.2/',
      title: null,
      image: null,
      type: 'website',
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[og-metadata:fetch]',
      expect.objectContaining({ outcome: 'fallback', reason: 'blocked_ip', hostname: '127.0.0.2' }),
    );
  });
});
