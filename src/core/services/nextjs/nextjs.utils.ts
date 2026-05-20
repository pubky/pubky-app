import { AppError } from '@/libs/error/error';
import {
  AuthErrorCode,
  ClientErrorCode,
  NetworkErrorCode,
  ServerErrorCode,
  ValidationErrorCode,
} from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { isIpSafe } from '@/libs/network/network';

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB

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
 * Resolves DNS and checks whether the resulting IP can be fetched safely.
 *
 * This helper does not create AppError instances. Callers that model DNS failure
 * as an expected outcome can consume the result directly; throwing callers should
 * wrap the result at their boundary.
 */
export async function checkDnsSafety(hostname: string): Promise<TDnsSafetyResult> {
  // Keep Node.js-only modules out of client bundles if this helper is imported from UI code.
  // See #1435.
  const { isIP } = await import(/* webpackIgnore: true */ 'net');
  const dns = await import(/* webpackIgnore: true */ 'dns/promises');

  let resolvedIp: string | undefined;

  // Resolve hostname to IP: use as-is if already an IP, otherwise DNS resolve to IPv4.
  if (isIP(hostname)) {
    resolvedIp = hostname;
  } else {
    try {
      const addresses = await dns.resolve4(hostname);
      resolvedIp = addresses[0];
    } catch (error) {
      if (isExpectedDnsResolutionError(error)) {
        return { ok: false, reason: 'dns_failed', cause: error };
      }

      throw error;
    }
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

/**
 * Resolves DNS for hostname and validates the resolved IP is safe.
 * Prevents SSRF attacks by checking IP before the actual fetch.
 */
export async function validateDns(hostname: string): Promise<void> {
  let result: TDnsSafetyResult;

  try {
    result = await checkDnsSafety(hostname);
  } catch (error) {
    if (error instanceof AppError) throw error;

    throw Err.server(ServerErrorCode.UNKNOWN_ERROR, 'DNS safety check failed', {
      service: ErrorService.NextJsServer,
      operation: 'validateDns',
      cause: error,
      context: { hostname, statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR },
    });
  }

  if (result.ok) {
    return;
  }

  if (result.reason === 'dns_failed') {
    throw Err.network(NetworkErrorCode.DNS_FAILED, 'DNS resolution failed', {
      service: ErrorService.NextJsServer,
      operation: 'validateDns',
      cause: result.cause,
      context: { hostname, statusCode: HttpStatusCode.BAD_REQUEST },
    });
  }

  if (result.reason === 'unsafe_ip') {
    throw Err.auth(AuthErrorCode.FORBIDDEN, 'Blocked IP range. Cannot fetch from private networks.', {
      service: ErrorService.NextJsServer,
      operation: 'validateDns',
      context: { hostname, statusCode: HttpStatusCode.FORBIDDEN },
    });
  }
}

function isExpectedDnsResolutionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const code = 'code' in error ? error.code : undefined;
  return (
    code === 'ENOTFOUND' ||
    code === 'ESERVFAIL' ||
    code === 'ETIMEDOUT' ||
    code === 'ETIMEOUT' ||
    code === 'EAI_AGAIN' ||
    code === 'ENODATA'
  );
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
  try {
    const imageUrl = new URL(image, baseUrl);

    if (!isHttpProtocol(imageUrl)) {
      return null;
    }

    // Reuse shared DNS + IP safety validation to avoid duplication with validateDns.
    try {
      await validateDns(imageUrl.hostname.toLowerCase());
    } catch {
      // If DNS validation fails or resolves to an unsafe IP, treat the image as invalid.
      return null;
    }

    return imageUrl.toString();
  } catch {
    return null;
  }
}
