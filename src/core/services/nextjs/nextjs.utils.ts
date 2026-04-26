import { HttpStatusCode } from '@/libs/http/http.types';
import { isIpSafe } from '@/libs/network/network';
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

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Checks whether a URL uses HTTP or HTTPS protocol.
 */
export function isHttpProtocol(url: URL): boolean {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

/**
 * Resolves DNS for hostname and validates the resolved IP is safe.
 * Prevents SSRF attacks by checking IP before the actual fetch.
 */
export async function validateDns(hostname: string): Promise<void> {
  // webpack bundles Node.js ONLY modules into client code via barrel imports
  // (e.g., FilterContent.tsx's `import * as Core from '@/core'`). See #1435.
  const { isIP } = await import(/* webpackIgnore: true */ 'net');
  const dns = await import(/* webpackIgnore: true */ 'dns/promises');

  let resolvedIp: string;

  try {
    // Resolve hostname to IP: use as-is if already an IP, otherwise DNS resolve to IPv4.
    if (isIP(hostname)) {
      resolvedIp = hostname;
    } else {
      const addresses = await dns.resolve4(hostname);
      if (!addresses || addresses.length === 0) {
        throw Err.network(NetworkErrorCode.DNS_FAILED, 'DNS resolution failed', {
          service: ErrorService.NextJsServer,
          operation: 'validateDns',
          context: { hostname, statusCode: HttpStatusCode.BAD_REQUEST },
        });
      }
      resolvedIp = addresses[0];
    }
  } catch (error) {
    if (error instanceof AppError) throw error;

    throw Err.network(NetworkErrorCode.DNS_FAILED, 'DNS resolution failed', {
      service: ErrorService.NextJsServer,
      operation: 'validateDns',
      cause: error,
      context: { hostname, statusCode: HttpStatusCode.BAD_REQUEST },
    });
  }

  // Reject private/reserved IP ranges to prevent SSRF (e.g. localhost, 10.x, 192.168.x).
  if (!isIpSafe(resolvedIp)) {
    throw Err.auth(AuthErrorCode.FORBIDDEN, 'Blocked IP range. Cannot fetch from private networks.', {
      service: ErrorService.NextJsServer,
      operation: 'validateDns',
      context: { hostname, statusCode: HttpStatusCode.FORBIDDEN },
    });
  }
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
