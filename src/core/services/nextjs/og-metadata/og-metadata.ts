import type { TOgMetadataFallbackReason, TOgMetadataResult } from '@/application/og-metadata/og-metadata.types';
import { AppError } from '@/libs/error/error';
import {
  AuthErrorCode,
  NetworkErrorCode,
  RateLimitErrorCode,
  ServerErrorCode,
  TimeoutErrorCode,
} from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { checkDnsSafety, isHttpProtocol, readResponseBody } from '../nextjs.utils';
import { buildFallbackMetadata, detectMediaType, extractMetadata, validateRedirectUrl } from './og-metadata.utils';

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 10_000;
const OG_METADATA_OPERATION = 'fetchOgMetadata';

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
  static async fetch(validatedUrl: URL): Promise<TOgMetadataResult> {
    const url = validatedUrl.toString();
    const hostname = validatedUrl.hostname;

    try {
      // 1. Resolve DNS and validate IP (prevents SSRF via DNS rebinding)
      const dnsResult = await validateDnsForOgMetadata(hostname);
      if (!dnsResult.ok) {
        if (dnsResult.reason === 'unsafe_ip') {
          throwBlockedIpError(hostname, 'validateDnsForOgMetadata');
        }
        throwExpectedOgMetadataError(dnsResult.reason, url, HttpStatusCode.SERVICE_UNAVAILABLE);
      }

      // 2. Fetch with redirect following and DNS validation on each hop
      const response = await fetchWithRedirectsForOgMetadata(url);

      // 3. Handle non-OK responses
      if (!response.ok) {
        return handleErrorResponse(response, url);
      }

      // 4. Check for media content types (image/video/audio)
      const mediaResult = detectMediaType(url, response);
      if (mediaResult) {
        // If it's valid media content type, return result and stop fetch process
        response.body?.cancel().catch(() => {});
        return mediaResult;
      }

      // 5. Validate HTML content type
      const contentTypeOutcome = resolveHtmlContentType(response, url);
      if (contentTypeOutcome) {
        return contentTypeOutcome;
      }

      // 6. Read response body with size limit
      const html = await readResponseBody(response);

      // 7. Extract and normalize metadata
      return await extractMetadata(url, html, normalizeImageUrlForOgMetadata);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw Err.server(ServerErrorCode.UNKNOWN_ERROR, 'Failed to fetch OG metadata', {
        service: ErrorService.NextJsServer,
        operation: OG_METADATA_OPERATION,
        cause: error,
        context: { url, statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR },
      });
    }
  }
}

// --- Module-private helpers (not exported; used only by NextJsOgMetadataService.fetch) ---

/**
 * Handles non-OK responses. Durable remote outcomes return cacheable fallback metadata;
 * transient remote outcomes throw narrowly-marked AppErrors so the route can return no-store.
 * Cancels the response body to release the TCP connection back to the pool.
 */
function handleErrorResponse(response: Response, url: string): TOgMetadataResult {
  response.body?.cancel().catch(() => {});

  if (
    response.status === HttpStatusCode.FORBIDDEN ||
    response.status === HttpStatusCode.NOT_FOUND ||
    response.status === HttpStatusCode.GONE
  ) {
    return durableFallback(url, 'http_error', { statusCode: response.status });
  }

  if (response.status === HttpStatusCode.TOO_MANY_REQUESTS) {
    throwExpectedOgMetadataError('rate_limit', url, HttpStatusCode.TOO_MANY_REQUESTS, {
      responseStatusCode: response.status,
    });
  }

  if (response.status === HttpStatusCode.REQUEST_TIMEOUT || response.status === HttpStatusCode.GATEWAY_TIMEOUT) {
    throwExpectedOgMetadataError('timeout', url, HttpStatusCode.REQUEST_TIMEOUT, {
      responseStatusCode: response.status,
    });
  }

  throwExpectedOgMetadataError('http_error', url, HttpStatusCode.SERVICE_UNAVAILABLE, {
    responseStatusCode: response.status,
  });
}

/**
 * Validates that the response has an HTML content type.
 * Cancels the response body and returns durable fallback metadata if not HTML.
 */
function resolveHtmlContentType(response: Response, url: string): TOgMetadataResult | null {
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
async function fetchWithRedirectsForOgMetadata(url: string): Promise<Response> {
  let currentUrl = url;

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const response = await fetchForOgMetadata(currentUrl, {
      headers: FETCH_HEADERS,
      redirect: 'manual', // Disable automatic redirects so we can validate each hop (DNS + protocol) ourselves
    });

    const redirectUrl = validateRedirectUrl(response, currentUrl);
    if (!redirectUrl) {
      return response;
    }

    // Release the redirect response body before following the next hop so the TCP connection can be reused promptly.
    response.body?.cancel().catch(() => {});

    const redirectDnsResult = await validateDnsForOgMetadata(redirectUrl.hostname);
    if (!redirectDnsResult.ok) {
      if (redirectDnsResult.reason === 'unsafe_ip') {
        throwBlockedIpError(redirectUrl.hostname, 'validateDnsForOgMetadata');
      }
      throwExpectedOgMetadataError(
        redirectDnsResult.reason,
        redirectUrl.toString(),
        HttpStatusCode.SERVICE_UNAVAILABLE,
      );
    }

    currentUrl = redirectUrl.toString();
  }

  throw Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Too many redirects', {
    service: ErrorService.NextJsServer,
    operation: 'fetchWithRedirects',
    context: { url, statusCode: HttpStatusCode.BAD_REQUEST },
  });
}

type OgExpectedFailureReason = Exclude<TOgMetadataFallbackReason, 'non_html'>;

type OgDnsResult = { ok: true } | { ok: false; reason: 'dns_failed' | 'unsafe_ip' };

type OgExpectedFailureStatus =
  | HttpStatusCode.REQUEST_TIMEOUT
  | HttpStatusCode.TOO_MANY_REQUESTS
  | HttpStatusCode.SERVICE_UNAVAILABLE;

type TOgMetadataLogReason = TOgMetadataFallbackReason | 'unsafe_ip';

function durableFallback(
  url: string,
  fallbackReason: Extract<TOgMetadataFallbackReason, 'http_error' | 'non_html'>,
  context: Record<string, unknown> = {},
): TOgMetadataResult {
  logFallback(url, fallbackReason, context);
  return buildFallbackMetadata(url);
}

function throwExpectedOgMetadataError(
  fallbackReason: OgExpectedFailureReason,
  url: string,
  statusCode: OgExpectedFailureStatus,
  context: Record<string, unknown> = {},
  cause?: unknown,
): never {
  logFallback(url, fallbackReason, { responseStatusCode: statusCode, ...context });

  const params = {
    service: ErrorService.NextJsServer,
    operation: OG_METADATA_OPERATION,
    cause,
    context: {
      source: 'og_metadata',
      reason: fallbackReason,
      cachePolicy: 'no-store',
      url,
      statusCode,
      ...context,
    },
  };

  if (fallbackReason === 'dns_failed') {
    throw Err.network(NetworkErrorCode.DNS_FAILED, 'DNS resolution failed', params);
  }

  if (fallbackReason === 'network') {
    throw Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Failed to fetch OG metadata', params);
  }

  if (fallbackReason === 'timeout') {
    throw Err.timeout(TimeoutErrorCode.REQUEST_TIMEOUT, 'Timed out fetching OG metadata', params);
  }

  if (fallbackReason === 'rate_limit') {
    throw Err.rateLimit(RateLimitErrorCode.RATE_LIMITED, 'OG metadata upstream rate limited', params);
  }

  throw Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'OG metadata upstream returned an error', params);
}

function logFallback(
  url: string,
  reason: TOgMetadataLogReason,
  context: Record<string, unknown>,
  hostname = getHostname(url),
): void {
  Logger.warn('[og-metadata:fetch]', {
    outcome: 'fallback',
    reason,
    hostname,
    ...context,
  });
}

function throwBlockedIpError(hostname: string, operation: string): never {
  throw Err.auth(AuthErrorCode.FORBIDDEN, 'Blocked IP range. Cannot fetch from private networks.', {
    service: ErrorService.NextJsServer,
    operation,
    context: { hostname, statusCode: HttpStatusCode.FORBIDDEN },
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
  const result = await checkDnsSafety(hostname);
  if (result.ok) {
    return { ok: true };
  }

  if (result.reason === 'dns_failed') {
    return { ok: false, reason: 'dns_failed' };
  }

  return { ok: false, reason: 'unsafe_ip' };
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
    logFallback(imageUrl.toString(), dnsResult.reason, { source: 'og_image' }, imageUrl.hostname);
    return null;
  }

  return imageUrl.toString();
}

async function fetchForOgMetadata(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throwExpectedOgMetadataError('timeout', url, HttpStatusCode.REQUEST_TIMEOUT, {}, error);
    }

    throwExpectedOgMetadataError('network', url, HttpStatusCode.SERVICE_UNAVAILABLE, {}, error);
  } finally {
    clearTimeout(timeoutId);
  }
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}
