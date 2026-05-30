import type { TOgMetadataFallbackReason, TOgMetadataResult } from '@/application/og-metadata/og-metadata.types';
import { AppError } from '@/libs/error/error';
import { AuthErrorCode, NetworkErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { checkDnsSafety, readResponseBody } from '../nextjs.utils';
import { buildFallbackMetadata, detectMediaType, extractMetadata, validateRedirectUrl } from './og-metadata.utils';

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 10_000;
const OG_METADATA_OPERATION = 'fetchOgMetadata';
const DNS_SAFETY_OPERATION = 'checkDnsSafety';

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
      const dnsResult = await checkDnsSafety(hostname);
      if (!dnsResult.ok) {
        if (dnsResult.reason === 'unsafe_ip') {
          throwBlockedIpError(hostname, DNS_SAFETY_OPERATION);
        }
        return fallback(url, dnsResult.reason, { hostname });
      }

      // 2. Fetch with redirect following and DNS validation on each hop
      const fetchResult = await fetchWithRedirectsForOgMetadata(url);
      if (!fetchResult.ok) {
        return fallback(fetchResult.url, fetchResult.reason, fetchResult.context);
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
      return await extractMetadata(url, html);
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
 * Handles non-OK responses. Remote HTTP failures are expected enrichment outcomes,
 * so they return fallback metadata instead of creating AppErrors/Sentry events.
 * Cancels the response body to release the TCP connection back to the pool.
 */
function handleErrorResponse(response: Response, url: string): TOgMetadataResult {
  response.body?.cancel().catch(() => {});

  if (response.status === HttpStatusCode.TOO_MANY_REQUESTS) {
    return fallback(url, 'rate_limit', { statusCode: response.status });
  }

  if (response.status === HttpStatusCode.REQUEST_TIMEOUT || response.status === HttpStatusCode.GATEWAY_TIMEOUT) {
    return fallback(url, 'timeout', { statusCode: response.status });
  }

  return fallback(url, 'http_error', { statusCode: response.status });
}

/**
 * Validates that the response has an HTML content type.
 * Cancels the response body and returns durable fallback metadata if not HTML.
 */
function resolveHtmlContentType(response: Response, url: string): TOgMetadataResult | null {
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('text/html')) {
    response.body?.cancel().catch(() => {});
    return fallback(url, 'non_html', { contentType });
  }

  return null;
}

/**
 * Follows redirects manually, validating DNS on each hop to prevent SSRF via open redirects.
 */
async function fetchWithRedirectsForOgMetadata(url: string): Promise<OgRedirectFetchResult> {
  let currentUrl = url;

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const fetchResult = await fetchForOgMetadata(currentUrl, {
      headers: FETCH_HEADERS,
      redirect: 'manual', // Disable automatic redirects so we can validate each hop (DNS + protocol) ourselves
    });
    if (!fetchResult.ok) return fetchResult;

    const { response } = fetchResult;
    const redirectUrl = validateRedirectUrl(response, currentUrl);
    if (!redirectUrl) {
      return { ok: true, response };
    }

    // Release the redirect response body before following the next hop so the TCP connection can be reused promptly.
    response.body?.cancel().catch(() => {});

    const redirectDnsResult = await checkDnsSafety(redirectUrl.hostname);
    if (!redirectDnsResult.ok) {
      if (redirectDnsResult.reason === 'unsafe_ip') {
        throwBlockedIpError(redirectUrl.hostname, DNS_SAFETY_OPERATION);
      }
      return { ok: false, reason: redirectDnsResult.reason, url: redirectUrl.toString() };
    }

    currentUrl = redirectUrl.toString();
  }

  throw Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Too many redirects', {
    service: ErrorService.NextJsServer,
    operation: 'fetchWithRedirects',
    context: { url, statusCode: HttpStatusCode.BAD_REQUEST },
  });
}

type OgFetchResult =
  | { ok: true; response: Response }
  | {
      ok: false;
      reason: Extract<TOgMetadataFallbackReason, 'network' | 'timeout'>;
      url: string;
      context?: Record<string, unknown>;
    };

type OgRedirectFetchResult =
  | { ok: true; response: Response }
  | {
      ok: false;
      reason: Extract<TOgMetadataFallbackReason, 'dns_failed' | 'network' | 'timeout'>;
      url: string;
      context?: Record<string, unknown>;
    };

function fallback(
  url: string,
  fallbackReason: TOgMetadataFallbackReason,
  context: Record<string, unknown> = {},
): TOgMetadataResult {
  logFallback(url, fallbackReason, context);
  return buildFallbackMetadata(url);
}

function logFallback(
  url: string,
  reason: TOgMetadataFallbackReason,
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
      return { ok: false, reason: 'timeout', url, context: { errorName: getErrorName(error) } };
    }

    return { ok: false, reason: 'network', url, context: { errorName: getErrorName(error) } };
  } finally {
    clearTimeout(timeoutId);
  }
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

function getErrorName(error: unknown): string | undefined {
  if (error instanceof Error) return error.name;
  if (typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string') {
    return error.name;
  }
  return undefined;
}
