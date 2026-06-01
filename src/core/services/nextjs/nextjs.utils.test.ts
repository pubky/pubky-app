import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientErrorCode, ServerErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { checkDnsSafety, normalizeImageUrl, readResponseBody } from './nextjs.utils';

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

vi.mock('@/libs/network/network', () => ({
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

const createDnsError = (code: string) => Object.assign(new Error(code), { code });

// ---------------------------------------------------------------------------
// checkDnsSafety
// ---------------------------------------------------------------------------

describe('checkDnsSafety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsIP.mockReturnValue(0);
    mockIsIpSafe.mockReturnValue(true);
  });

  it('should resolve hostname via DNS and pass when the first resolved IP is safe', async () => {
    mockResolve4.mockResolvedValueOnce(['1.2.3.4']);

    await expect(checkDnsSafety('example.com')).resolves.toEqual({ ok: true });
    expect(mockResolve4).toHaveBeenCalledWith('example.com');
    expect(mockIsIpSafe).toHaveBeenCalledWith('1.2.3.4');
  });

  it('should preserve first-address DNS safety behavior', async () => {
    mockResolve4.mockResolvedValueOnce(['1.2.3.4', '127.0.0.1']);
    mockIsIpSafe.mockImplementation((ip) => ip !== '127.0.0.1');

    await expect(checkDnsSafety('example.com')).resolves.toEqual({ ok: true });
    expect(mockIsIpSafe).toHaveBeenCalledTimes(1);
    expect(mockIsIpSafe).toHaveBeenCalledWith('1.2.3.4');
  });

  it('should skip DNS resolution when hostname is already an IP', async () => {
    mockIsIP.mockReturnValue(4);

    await expect(checkDnsSafety('1.2.3.4')).resolves.toEqual({ ok: true });
    expect(mockResolve4).not.toHaveBeenCalled();
    expect(mockIsIpSafe).toHaveBeenCalledWith('1.2.3.4');
  });

  it('should return dns_failed when DNS resolves to empty addresses', async () => {
    mockResolve4.mockResolvedValueOnce([]);

    await expect(checkDnsSafety('empty.com')).resolves.toEqual({ ok: false, reason: 'dns_failed' });
  });

  it.each(EXPECTED_DNS_ERROR_CODES)('should return dns_failed for expected DNS error %s', async (code) => {
    const error = createDnsError(code);
    mockResolve4.mockRejectedValueOnce(error);

    await expect(checkDnsSafety('bad.com')).resolves.toEqual({
      ok: false,
      reason: 'dns_failed',
      cause: error,
    });
  });

  it('should throw unexpected DNS resolver errors unchanged', async () => {
    const rawError = new Error('resolver bug');
    mockResolve4.mockRejectedValueOnce(rawError);

    await expect(checkDnsSafety('bad.com')).rejects.toBe(rawError);
  });

  it('should return unsafe_ip when resolved IP is unsafe', async () => {
    mockResolve4.mockResolvedValueOnce(['127.0.0.1']);
    mockIsIpSafe.mockReturnValue(false);

    await expect(checkDnsSafety('unsafe.test')).resolves.toEqual({ ok: false, reason: 'unsafe_ip' });
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
    mockResolve4.mockRejectedValueOnce(createDnsError('ENOTFOUND'));

    const result = await normalizeImageUrl('https://bad.com/image.png', 'https://example.com');

    expect(result).toBeNull();
  });

  it('should return null when DNS resolves to an unsafe IP', async () => {
    mockResolve4.mockResolvedValueOnce(['127.0.0.1']);
    mockIsIpSafe.mockReturnValue(false);

    const result = await normalizeImageUrl('https://unsafe.test/image.png', 'https://example.com');

    expect(result).toBeNull();
  });

  it('should throw unexpected DNS safety errors', async () => {
    const rawError = new Error('resolver bug');
    mockResolve4.mockRejectedValueOnce(rawError);

    await expect(normalizeImageUrl('https://bad.com/image.png', 'https://example.com')).rejects.toBe(rawError);
  });

  it('should return null for invalid URLs', async () => {
    const result = await normalizeImageUrl('://invalid', 'not-a-url');

    expect(result).toBeNull();
  });
});
