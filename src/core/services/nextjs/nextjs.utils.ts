import { AppError } from '@/libs/error/error';
import { ClientErrorCode, ServerErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { isIpSafe } from '@/libs/network/network';

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
const EXPECTED_DNS_ERROR_CODES = new Set([
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
]);

type TDnsSafetyResult =
  | { ok: true }
  | { ok: false; reason: 'dns_failed'; cause?: unknown }
  | { ok: false; reason: 'unsafe_ip' };

/**
 * Checks whether a URL uses HTTP or HTTPS protocol.
 */
export function isHttpProtocol(url: URL): boolean {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

/**
 * Resolves DNS for hostname and validates the resolved IP is safe without creating AppErrors.
 * Uses the first resolved IPv4 address to preserve the existing SSRF guard semantics.
 */
export async function checkDnsSafety(hostname: string): Promise<TDnsSafetyResult> {
  // Keep Node.js-only modules out of client bundles if this helper is imported from UI code.
  // See #1435.
  const { isIP } = await import(/* webpackIgnore: true */ 'net');
  const dns = await import(/* webpackIgnore: true */ 'dns/promises');

  let resolvedIp: string | undefined;

  try {
    // Resolve hostname to IP: use as-is if already an IP, otherwise DNS resolve to IPv4.
    if (isIP(hostname)) {
      resolvedIp = hostname;
    } else {
      const addresses = await dns.resolve4(hostname);
      resolvedIp = addresses[0];
    }
  } catch (error) {
    if (isExpectedDnsResolutionError(error)) {
      return { ok: false, reason: 'dns_failed', cause: error };
    }

    throw error;
  }

  if (!resolvedIp) {
    return { ok: false, reason: 'dns_failed' };
  }

  // Reject private/reserved IP ranges to prevent SSRF (e.g. localhost, 10.x, 192.168.x).
  if (!isIpSafe(resolvedIp)) {
    return { ok: false, reason: 'unsafe_ip' };
  }

  return { ok: true };
}

function isExpectedDnsResolutionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const code = 'code' in error ? error.code : undefined;
  return typeof code === 'string' && EXPECTED_DNS_ERROR_CODES.has(code);
}

/**
 * Reads response body with a 5MB size limit using stream reader.
 * Content-Length headers can be spoofed, so we enforce the limit by reading the stream.
 */
export async function readResponseBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'No response body', {
      service: ErrorService.NextJsServer,
      operation: 'readResponseBody',
      context: { statusCode: HttpStatusCode.BAD_REQUEST },
    });
  }

  let totalBytes = 0;
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_SIZE) {
        await reader.cancel();
        throw Err.client(ClientErrorCode.PAYLOAD_TOO_LARGE, 'Response too large (max 5MB)', {
          service: ErrorService.NextJsServer,
          operation: 'readResponseBody',
          context: { totalBytes, statusCode: HttpStatusCode.PAYLOAD_TOO_LARGE },
        });
      }

      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;

    throw Err.server(ServerErrorCode.UNKNOWN_ERROR, 'Failed to read response body', {
      service: ErrorService.NextJsServer,
      operation: 'readResponseBody',
      cause: error,
      context: { statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR },
    });
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Normalizes a relative image URL to absolute and validates it against SSRF.
 * Returns null if the image URL is invalid, uses a non-HTTP protocol, or resolves to a private IP.
 */
export async function normalizeImageUrl(image: string, baseUrl: string): Promise<string | null> {
  let imageUrl: URL;

  try {
    imageUrl = new URL(image, baseUrl);
  } catch {
    return null;
  }

  if (!isHttpProtocol(imageUrl)) {
    return null;
  }

  const dnsResult = await checkDnsSafety(imageUrl.hostname.toLowerCase());
  if (!dnsResult.ok) {
    // If DNS validation fails or resolves to an unsafe IP, treat the image as invalid.
    return null;
  }

  return imageUrl.toString();
}
