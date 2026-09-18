import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isIpSafe } from '@/libs/network/network';

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
/**
 * Deadline for reading a remote body. The og-metadata fetch timeout is cleared as soon as the
 * response headers arrive, so the body read needs a bound of its own: without one, a remote that
 * trickles or stalls mid-body holds the request open until the platform kills it.
 */
const RESPONSE_READ_TIMEOUT_MS = 10_000;
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
        ...result.value.map((address): TDnsSafeAddress => ({
          address,
          family: address.includes(':') ? IP_FAMILY_IPV6 : IP_FAMILY_IPV4,
        })),
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
 * Reason a response body could not be read. Every value is an expected outcome for best-effort
 * enrichment, so callers map them onto the fallback shape instead of an `Err.*`.
 */
export type TResponseBodyReadFailure = 'body_too_large' | 'body_timeout' | 'body_unreadable';

export type TResponseBodyReadResult = { ok: true; body: string } | { ok: false; reason: TResponseBodyReadFailure };

/**
 * Reads a response body as text under a size cap and a read deadline.
 * Content-Length headers can be spoofed, so the cap is enforced by counting the streamed bytes.
 *
 * The cap and the deadline are returned as data rather than thrown: a remote document that is
 * oversized, stalls, or dies mid-stream is a page we could not preview, not a bug, and must not
 * become a Sentry issue through `Err.*`.
 */
export async function readResponseBody(response: Response): Promise<TResponseBodyReadResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    return { ok: false, reason: 'body_unreadable' };
  }

  let totalBytes = 0;
  let timedOut = false;
  const chunks: Uint8Array[] = [];
  const timeoutId = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, RESPONSE_READ_TIMEOUT_MS);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut) return { ok: false, reason: 'body_timeout' };
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_SIZE) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: 'body_too_large' };
      }

      chunks.push(value);
    }
  } catch {
    // A body that errors mid-stream is an expected remote failure, not an internal one.
    return { ok: false, reason: timedOut ? 'body_timeout' : 'body_unreadable' };
  } finally {
    clearTimeout(timeoutId);
  }

  return { ok: true, body: new TextDecoder().decode(Buffer.concat(chunks)) };
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
