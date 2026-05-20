import type {
  TOgMetadataFallbackReason,
  TOgMetadataFetchOutcome,
  TOgMetadataResult,
} from '@/application/og-metadata/og-metadata.types';
import { AppError } from '@/libs/error/error';
import { AuthErrorCode, NetworkErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { isIpSafe } from '@/libs/network/network';
import { isHttpProtocol, readResponseBody } from '../nextjs.utils';
import { buildFallbackMetadata, detectMediaType, extractMetadata, validateRedirectUrl } from './og-metadata.utils';

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 10_000;

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html, image/*, video/*, audio/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Upgrade-Insecure-Requests': '1',
};

/**
 * Next.js OG Metadata Service
 *
 * Handles fetching OG metadata for validated URLs.
 * Orchestrates DNS validation, redirect following, content parsing.
 */
export class NextJsOgMetadataService {
  private constructor() {}

  /**
   * Fetches OG metadata for a validated URL.
   *
   * @param validatedUrl - Parsed and validated URL from the pipes layer
   * @returns Normalized OG metadata result
   */
  static async fetch(validatedUrl: URL): Promise<TOgMetadataFetchOutcome> {
    const url = validatedUrl.toString();
    const hostname = validatedUrl.hostname;

    try {
      // 1. Resolve DNS and validate IP (prevents SSRF via DNS rebinding)
      const dnsResult = await validateDnsForOgMetadata(hostname);
      if (!dnsResult.ok) {
        return transientFallback(url, dnsResult.reason, HttpStatusCode.SERVICE_UNAVAILABLE);
      }

      // 2. Fetch with redirect following and DNS validation on each hop
      const fetchResult = await fetchWithRedirectsForOgMetadata(url);
      if (!fetchResult.ok) {
        return transientFallback(url, fetchResult.reason, fetchResult.statusCode);
      }
      const { response } = fetchResult;

      // 3. Handle non-OK responses
      if (!response.ok) {
        return handleErrorResponse(response, url);
      }

      // 4. Check for media content types (image/video/audio)
      const mediaResult = detectMediaType(url, response);
      if (mediaResult) {
        // If it's valid media content type, return result and stop fetch process
        response.body?.cancel().catch(() => {});
        return success(mediaResult);
      }

      // 5. Validate HTML content type
      const contentTypeOutcome = resolveHtmlContentType(response, url);
      if (contentTypeOutcome) {
        return contentTypeOutcome;
      }

      // 6. Read response body with size limit
      const html = await readResponseBody(response);

      // 7. Extract and normalize metadata
      return success(await extractMetadata(url, html, normalizeImageUrlForOgMetadata));
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw Err.server(ServerErrorCode.UNKNOWN_ERROR, 'Failed to fetch OG metadata', {
        service: ErrorService.NextJsServer,
        operation: 'fetchOgMetadata',
        cause: error,
        context: { url, statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR },
      });
    }
  }
}

// --- Module-private helpers (not exported; used only by NextJsOgMetadataService.fetch) ---

/**
 * Handles non-OK responses without creating AppError for expected remote outcomes.
 * Cancels the response body to release the TCP connection back to the pool.
 */
function handleErrorResponse(response: Response, url: string): TOgMetadataFetchOutcome {
  response.body?.cancel().catch(() => {});

  if (
    response.status === HttpStatusCode.FORBIDDEN ||
    response.status === HttpStatusCode.NOT_FOUND ||
    response.status === HttpStatusCode.GONE
  ) {
    return durableFallback(url, 'http_error', { statusCode: response.status });
  }

  if (response.status === HttpStatusCode.TOO_MANY_REQUESTS) {
    return transientFallback(url, 'rate_limit', HttpStatusCode.TOO_MANY_REQUESTS, { statusCode: response.status });
  }

  if (response.status === HttpStatusCode.REQUEST_TIMEOUT || response.status === HttpStatusCode.GATEWAY_TIMEOUT) {
    return transientFallback(url, 'timeout', HttpStatusCode.REQUEST_TIMEOUT, { statusCode: response.status });
  }

  return transientFallback(url, 'http_error', HttpStatusCode.SERVICE_UNAVAILABLE, { statusCode: response.status });
}

/**
 * Validates that the response has an HTML content type.
 * Cancels the response body and returns durable fallback metadata if not HTML.
 */
function resolveHtmlContentType(response: Response, url: string): TOgMetadataFetchOutcome | null {
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('text/html')) {
    response.body?.cancel().catch(() => {});
    return durableFallback(url, 'non_html', { contentType });
  }

  return null;
}

/**
 * Follows redirects manually, validating DNS on each hop to prevent SSRF via open redirects.
 */
async function fetchWithRedirectsForOgMetadata(url: string): Promise<OgFetchResult> {
  let currentUrl = url;

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const fetchResult = await fetchForOgMetadata(currentUrl, {
      headers: FETCH_HEADERS,
      redirect: 'manual', // Disable automatic redirects so we can validate each hop (DNS + protocol) ourselves
    });
    if (!fetchResult.ok) {
      return fetchResult;
    }
    const { response } = fetchResult;

    const redirectUrl = validateRedirectUrl(response, currentUrl);
    if (!redirectUrl) {
      return { ok: true, response };
    }

    // Release the redirect response body before following the next hop so the TCP connection can be reused promptly.
    response.body?.cancel().catch(() => {});

    const redirectDnsResult = await validateDnsForOgMetadata(redirectUrl.hostname);
    if (!redirectDnsResult.ok) {
      return { ok: false, reason: redirectDnsResult.reason, statusCode: HttpStatusCode.SERVICE_UNAVAILABLE };
    }

    currentUrl = redirectUrl.toString();
  }

  throw Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Too many redirects', {
    service: ErrorService.NextJsServer,
    operation: 'fetchWithRedirects',
    context: { url, statusCode: HttpStatusCode.BAD_REQUEST },
  });
}

type OgExpectedFailureReason = Extract<TOgMetadataFallbackReason, 'dns_failed' | 'network' | 'timeout'>;

type OgDnsResult = { ok: true } | { ok: false; reason: Extract<OgExpectedFailureReason, 'dns_failed'> };

type OgFetchResult =
  | { ok: true; response: Response }
  | {
      ok: false;
      reason: OgExpectedFailureReason;
      statusCode: HttpStatusCode.REQUEST_TIMEOUT | HttpStatusCode.SERVICE_UNAVAILABLE;
    };

function success(metadata: TOgMetadataResult): TOgMetadataFetchOutcome {
  return { kind: 'success', metadata, cachePolicy: 'normal' };
}

function durableFallback(
  url: string,
  fallbackReason: Extract<TOgMetadataFallbackReason, 'http_error' | 'non_html'>,
  context: Record<string, unknown> = {},
): TOgMetadataFetchOutcome {
  logFallback(url, fallbackReason, context);
  return {
    kind: 'durable-fallback',
    metadata: buildFallbackMetadata(url),
    fallbackReason,
    cachePolicy: 'normal',
  };
}

function transientFallback(
  url: string,
  fallbackReason: Exclude<TOgMetadataFallbackReason, 'non_html'>,
  statusCode: HttpStatusCode.REQUEST_TIMEOUT | HttpStatusCode.TOO_MANY_REQUESTS | HttpStatusCode.SERVICE_UNAVAILABLE,
  context: Record<string, unknown> = {},
): TOgMetadataFetchOutcome {
  logFallback(url, fallbackReason, { ...context, responseStatusCode: statusCode });
  return {
    kind: 'transient-fallback',
    statusCode,
    fallbackReason,
    cachePolicy: 'no-store',
  };
}

function logFallback(url: string, reason: TOgMetadataFallbackReason, context: Record<string, unknown>): void {
  Logger.warn('[og-metadata:fetch]', {
    outcome: 'fallback',
    reason,
    hostname: getHostname(url),
    ...context,
  });
}

function getHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

async function validateDnsForOgMetadata(hostname: string): Promise<OgDnsResult> {
  const { isIP } = await import(/* webpackIgnore: true */ 'net');
  const dns = await import(/* webpackIgnore: true */ 'dns/promises');

  let resolvedIp: string;

  try {
    resolvedIp = isIP(hostname) ? hostname : (await dns.resolve4(hostname))[0];
  } catch {
    return { ok: false, reason: 'dns_failed' };
  }

  if (!resolvedIp) {
    return { ok: false, reason: 'dns_failed' };
  }

  if (!isIpSafe(resolvedIp)) {
    throw Err.auth(AuthErrorCode.FORBIDDEN, 'Blocked IP range. Cannot fetch from private networks.', {
      service: ErrorService.NextJsServer,
      operation: 'validateDnsForOgMetadata',
      context: { hostname, statusCode: HttpStatusCode.FORBIDDEN },
    });
  }

  return { ok: true };
}

async function normalizeImageUrlForOgMetadata(image: string, baseUrl: string): Promise<string | null> {
  let imageUrl: URL;
  try {
    imageUrl = new URL(image, baseUrl);
  } catch {
    return null;
  }

  if (!isHttpProtocol(imageUrl)) {
    return null;
  }

  const dnsResult = await validateDnsForOgMetadata(imageUrl.hostname.toLowerCase());
  if (!dnsResult.ok) {
    logFallback(imageUrl.toString(), dnsResult.reason, { source: 'og_image' });
    return null;
  }

  return imageUrl.toString();
}

async function fetchForOgMetadata(url: string, options: RequestInit): Promise<OgFetchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    return { ok: true, response };
  } catch (error) {
    if (isAbortError(error)) {
      return { ok: false, reason: 'timeout', statusCode: HttpStatusCode.REQUEST_TIMEOUT };
    }

    return { ok: false, reason: 'network', statusCode: HttpStatusCode.SERVICE_UNAVAILABLE };
  } finally {
    clearTimeout(timeoutId);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}
