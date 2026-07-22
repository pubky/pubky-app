import { AppError } from '@/libs/error/error';
import { ClientErrorCode, ServerErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { isIpSafe } from '@/libs/network/network';

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
const DNS_SAFETY_OPERATION = 'checkDnsSafety';
const IP_FAMILY_IPV4 = 4;
const IP_FAMILY_IPV6 = 6;
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

type TDnsSafeAddress = { address: string; family: 4 | 6 };

type TDnsSafetyResult =
  | { ok: true; addresses: TDnsSafeAddress[] }
  | { ok: false; reason: 'dns_failed'; cause?: unknown }
  | { ok: false; reason: 'unsafe_ip' };

/**
 * Checks whether a URL uses HTTP or HTTPS protocol.
 */
export function isHttpProtocol(url: URL): boolean {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

/**
 * Resolves DNS for a hostname and validates every resolved address.
 * Expected resolver failures are returned as data; unexpected failures throw an AppError.
 */
export async function checkDnsSafety(hostname: string): Promise<TDnsSafetyResult> {
  // Keep Node.js-only modules out of client bundles if this helper is imported from UI code.
  // See #1435.
  const { isIP } = await import(/* webpackIgnore: true */ 'net');
  const dns = await import(/* webpackIgnore: true */ 'dns/promises');
  const normalizedHostname = normalizeIpHostname(hostname.toLowerCase());

  const ipFamily = isIP(normalizedHostname);
  if (ipFamily === IP_FAMILY_IPV4 || ipFamily === IP_FAMILY_IPV6) {
    if (!isIpSafe(normalizedHostname)) {
      return { ok: false, reason: 'unsafe_ip' };
    }

    return { ok: true, addresses: [{ address: normalizedHostname, family: ipFamily }] };
  }

  const [ipv4Result, ipv6Result] = await Promise.allSettled([
    dns.resolve4(normalizedHostname),
    dns.resolve6(normalizedHostname),
  ]);

  const resolvedAddresses: TDnsSafeAddress[] = [];
  let dnsFailureCause: unknown;

  for (const result of [ipv4Result, ipv6Result]) {
    if (result.status === 'fulfilled') {
      resolvedAddresses.push(
        ...result.value.map(
          (address): TDnsSafeAddress => ({
            address,
            family: address.includes(':') ? IP_FAMILY_IPV6 : IP_FAMILY_IPV4,
          }),
        ),
      );
      continue;
    }

    if (isExpectedDnsResolutionError(result.reason)) {
      dnsFailureCause ??= result.reason;
      continue;
    }

    throw Err.server(ServerErrorCode.UNKNOWN_ERROR, 'DNS safety check failed', {
      service: ErrorService.NextJsServer,
      operation: DNS_SAFETY_OPERATION,
      cause: result.reason,
      context: { hostname: normalizedHostname },
    });
  }

  if (resolvedAddresses.length === 0) {
    return { ok: false, reason: 'dns_failed', cause: dnsFailureCause };
  }

  if (resolvedAddresses.some(({ address }) => !isIpSafe(address))) {
    return { ok: false, reason: 'unsafe_ip' };
  }

  return { ok: true, addresses: resolvedAddresses };
}

function isExpectedDnsResolutionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const code = 'code' in error ? error.code : undefined;
  return typeof code === 'string' && EXPECTED_DNS_ERROR_CODES.has(code);
}

function normalizeIpHostname(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }

  return hostname;
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
