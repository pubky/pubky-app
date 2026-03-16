import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AppError,
  ErrorCategory,
  ErrorService,
  NetworkErrorCode,
  AuthErrorCode,
  ValidationErrorCode,
  ClientErrorCode,
  ServerErrorCode,
  HttpStatusCode,
} from '@/libs';
import { validateDns, readResponseBody, normalizeImageUrl } from './nextjs.utils';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a real ReadableStream that yields chunks in order. Needed because readResponseBody calls response.body.getReader(). */
function createReadableStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]);
      } else {
        controller.close();
      }
    },
  });
}

function createMockResponse(body: string): Response {
  const encoded = new TextEncoder().encode(body);
  return new Response(createReadableStream([encoded]));
}

// ---------------------------------------------------------------------------
// validateDns
// ---------------------------------------------------------------------------

describe('validateDns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsIP.mockReturnValue(0); // not an IP by default
    mockIsIpSafe.mockReturnValue(true); // safe by default
  });

  it('should resolve hostname via DNS and pass when IP is safe', async () => {
    mockResolve4.mockResolvedValueOnce(['1.2.3.4']);

    await expect(validateDns('example.com')).resolves.toBeUndefined();
    expect(mockResolve4).toHaveBeenCalledWith('example.com');
  });

  it('should skip DNS resolution when hostname is already an IP', async () => {
    mockIsIP.mockReturnValue(4); // IPv4
    mockIsIpSafe.mockReturnValue(true);

    await expect(validateDns('1.2.3.4')).resolves.toBeUndefined();
    expect(mockResolve4).not.toHaveBeenCalled();
  });

  it('should throw network error when DNS resolves to empty addresses', async () => {
    mockResolve4.mockResolvedValueOnce([]);

    await expect(validateDns('empty.com')).rejects.toMatchObject({
      category: ErrorCategory.Network,
      code: NetworkErrorCode.DNS_FAILED,
      service: ErrorService.NextJsServer,
      context: { hostname: 'empty.com', statusCode: HttpStatusCode.BAD_REQUEST },
    });
  });

  it('should throw auth error when resolved IP is unsafe (SSRF)', async () => {
    mockResolve4.mockResolvedValueOnce(['127.0.0.1']);
    mockIsIpSafe.mockReturnValue(false);

    await expect(validateDns('unsafe.test')).rejects.toMatchObject({
      category: ErrorCategory.Auth,
      code: AuthErrorCode.FORBIDDEN,
      service: ErrorService.NextJsServer,
    });
  });

  it('should re-throw AppError as-is from inner try block', async () => {
    // When dns.resolve4 returns empty, the inner try creates an AppError.
    // The outer catch must re-throw it unchanged (not double-wrap).
    mockResolve4.mockResolvedValueOnce([]);

    const error = await validateDns('empty.com').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      category: ErrorCategory.Network,
      code: NetworkErrorCode.DNS_FAILED,
      message: 'DNS resolution failed',
    });
    // Should NOT have a `cause` — it's the original, not a wrapped copy
    expect((error as AppError).cause).toBeUndefined();
  });

  it('should wrap raw DNS errors into AppError with cause', async () => {
    const nativeError = new Error('ENOTFOUND');
    mockResolve4.mockRejectedValueOnce(nativeError);

    await expect(validateDns('bad.com')).rejects.toMatchObject({
      category: ErrorCategory.Network,
      code: NetworkErrorCode.DNS_FAILED,
      cause: nativeError,
      context: { hostname: 'bad.com', statusCode: HttpStatusCode.BAD_REQUEST },
    });
  });
});

// ---------------------------------------------------------------------------
// readResponseBody
// ---------------------------------------------------------------------------

describe('readResponseBody', () => {
  it('should read response body as text', async () => {
    const response = createMockResponse('hello world');

    const result = await readResponseBody(response);

    expect(result).toBe('hello world');
  });

  it('should throw validation error when response has no body', async () => {
    const response = new Response(null);
    // Override body to be undefined
    Object.defineProperty(response, 'body', { value: undefined });

    await expect(readResponseBody(response)).rejects.toMatchObject({
      category: ErrorCategory.Validation,
      code: ValidationErrorCode.INVALID_INPUT,
      service: ErrorService.NextJsServer,
    });
  });

  it('should throw client error when response exceeds 5MB', async () => {
    const bigChunk = new Uint8Array(6 * 1024 * 1024); // 6MB
    const response = new Response(createReadableStream([bigChunk]));

    await expect(readResponseBody(response)).rejects.toMatchObject({
      category: ErrorCategory.Client,
      code: ClientErrorCode.PAYLOAD_TOO_LARGE,
      service: ErrorService.NextJsServer,
    });
  });

  it('should wrap raw stream errors into server AppError with cause', async () => {
    // Ensures that low-level stream errors thrown while reading the response body
    // are not leaked directly, but are wrapped into a server AppError with
    // UNKNOWN_ERROR code and the original error preserved as `cause`.
    const streamError = new Error('network stream broken');
    let callCount = 0;
    const failingStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (callCount++ === 0) {
          controller.enqueue(new TextEncoder().encode('partial'));
        } else {
          controller.error(streamError);
        }
      },
    });
    const response = new Response(failingStream);

    await expect(readResponseBody(response)).rejects.toMatchObject({
      category: ErrorCategory.Server,
      code: ServerErrorCode.UNKNOWN_ERROR,
      cause: streamError,
      service: ErrorService.NextJsServer,
    });
  });
});

// ---------------------------------------------------------------------------
// normalizeImageUrl
// ---------------------------------------------------------------------------

describe('normalizeImageUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsIP.mockReturnValue(0);
    mockIsIpSafe.mockReturnValue(true);
    mockResolve4.mockResolvedValue(['1.2.3.4']);
  });

  it('should resolve relative URL to absolute', async () => {
    const result = await normalizeImageUrl('/image.png', 'https://example.com/page');

    expect(result).toBe('https://example.com/image.png');
  });

  it('should return null for non-HTTP protocols', async () => {
    const result = await normalizeImageUrl('ftp://example.com/image.png', 'https://example.com');

    expect(result).toBeNull();
  });

  it('should return null when DNS validation fails', async () => {
    mockResolve4.mockRejectedValueOnce(new Error('ENOTFOUND'));

    const result = await normalizeImageUrl('https://bad.com/image.png', 'https://example.com');

    expect(result).toBeNull();
  });

  it('should return null for invalid URLs', async () => {
    const result = await normalizeImageUrl('://invalid', 'not-a-url');

    expect(result).toBeNull();
  });
});
