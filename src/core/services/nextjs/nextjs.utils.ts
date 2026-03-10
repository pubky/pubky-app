import * as Libs from '@/libs';
import { isIpSafe } from '@/libs/network';
import { nextjsApiQueryClient } from './nextjs-api.query-client';
import type { TQueryNextjsParams } from './nextjs.utils.types';

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
const FETCH_TIMEOUT_MS = 10_000;

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html, image/*, video/*, audio/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Upgrade-Insecure-Requests': '1',
};

/**
 * Queries via the NextJS API query client with caching, deduplication, and retry.
 * Builds the query key internally as ['nextjs-api', topic, url].
 *
 * @param topic - Topic identifier for cache key namespacing (e.g., 'og-metadata')
 * @param url - The URL being queried, used as the cache key discriminator
 * @param queryFn - Function that performs the actual fetch
 * @returns Cached or freshly fetched data
 */
export async function queryNextjs<T>({ topic, url, queryFn }: TQueryNextjsParams<T>): Promise<T> {
  return nextjsApiQueryClient.fetchQuery({
    queryKey: ['nextjs-api', topic, url],
    queryFn,
  });
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
        throw Libs.Err.network(Libs.NetworkErrorCode.DNS_FAILED, 'DNS resolution failed', {
          service: Libs.ErrorService.NextJsServer,
          operation: 'validateDns',
          context: { hostname, statusCode: Libs.HttpStatusCode.BAD_REQUEST },
        });
      }
      resolvedIp = addresses[0];
    }
  } catch (error) {
    if (error instanceof Libs.AppError) throw error;

    throw Libs.Err.network(Libs.NetworkErrorCode.DNS_FAILED, 'DNS resolution failed', {
      service: Libs.ErrorService.NextJsServer,
      operation: 'validateDns',
      cause: error,
      context: { hostname, statusCode: Libs.HttpStatusCode.BAD_REQUEST },
    });
  }

  // Reject private/reserved IP ranges to prevent SSRF (e.g. localhost, 10.x, 192.168.x).
  if (!isIpSafe(resolvedIp)) {
    throw Libs.Err.auth(Libs.AuthErrorCode.FORBIDDEN, 'Blocked IP range. Cannot fetch from private networks.', {
      service: Libs.ErrorService.NextJsServer,
      operation: 'validateDns',
      context: { hostname, statusCode: Libs.HttpStatusCode.FORBIDDEN },
    });
  }
}

/**
 * Follows redirects manually, validating DNS on each hop to prevent SSRF via open redirects.
 * Uses safeFetch for standardized network error handling.
 */
export async function fetchWithRedirects(url: string): Promise<Response> {
  let currentUrl = url;

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await Libs.safeFetch(
        currentUrl,
        {
          signal: controller.signal,
          headers: FETCH_HEADERS,
          redirect: 'manual', // Disable automatic redirects so we can validate each hop (DNS + protocol) ourselves
        },
        Libs.ErrorService.NextJsServer,
        'fetch',
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status < 300 || response.status >= 400) {
      // ex: 1xx, 2xx, 4xx, 5xx
      return response;
    }

    const location = response.headers.get('location');
    // 3xx without Location is invalid/malformed; we cannot resolve the next URL, so treat this as the final response.
    if (!location) {
      return response;
    }

    const redirectUrl = new URL(location, currentUrl);
    // Must be HTTP or HTTPS to prevent SSRF via redirect to non-HTTP protocols.
    if (!['http:', 'https:'].includes(redirectUrl.protocol)) {
      response.body?.cancel().catch(() => {}); // cancel the response body to release the TCP connection back to the pool
      throw Libs.Err.auth(Libs.AuthErrorCode.FORBIDDEN, 'Blocked redirect to non-HTTP protocol', {
        service: Libs.ErrorService.NextJsServer,
        operation: 'fetchWithRedirects',
        context: { protocol: redirectUrl.protocol, statusCode: Libs.HttpStatusCode.FORBIDDEN },
      });
    }

    // Release the redirect response body before following the next hop so the TCP connection can be reused promptly.
    response.body?.cancel().catch(() => {});

    await validateDns(redirectUrl.hostname);

    currentUrl = redirectUrl.toString();
  }

  throw Libs.Err.network(Libs.NetworkErrorCode.CONNECTION_FAILED, 'Too many redirects', {
    service: Libs.ErrorService.NextJsServer,
    operation: 'fetchWithRedirects',
    context: { url, statusCode: Libs.HttpStatusCode.BAD_REQUEST },
  });
}

/**
 * Reads response body with a 5MB size limit using stream reader.
 * Content-Length headers can be spoofed, so we enforce the limit by reading the stream.
 */
export async function readResponseBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw Libs.Err.validation(Libs.ValidationErrorCode.INVALID_INPUT, 'No response body', {
      service: Libs.ErrorService.NextJsServer,
      operation: 'readResponseBody',
      context: { statusCode: Libs.HttpStatusCode.BAD_REQUEST },
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
        throw Libs.Err.client(Libs.ClientErrorCode.PAYLOAD_TOO_LARGE, 'Response too large (max 5MB)', {
          service: Libs.ErrorService.NextJsServer,
          operation: 'readResponseBody',
          context: { totalBytes, statusCode: Libs.HttpStatusCode.PAYLOAD_TOO_LARGE },
        });
      }

      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof Libs.AppError) throw error;

    throw Libs.Err.server(Libs.ServerErrorCode.UNKNOWN_ERROR, 'Failed to read response body', {
      service: Libs.ErrorService.NextJsServer,
      operation: 'readResponseBody',
      cause: error,
      context: { statusCode: Libs.HttpStatusCode.INTERNAL_SERVER_ERROR },
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

    if (!['http:', 'https:'].includes(imageUrl.protocol)) {
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
