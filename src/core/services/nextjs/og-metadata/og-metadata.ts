import type { LookupFunction } from 'node:net';
import type { Dispatcher } from 'undici';
import { Agent } from 'undici';
import type { TOgMetadataFallbackReason, TOgMetadataResult } from '@/application/og-metadata/og-metadata.types';
import { AppError } from '@/libs/error/error';
import { NetworkErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { checkDnsSafety, readResponseBody } from '../nextjs.utils';
import {
  buildFallbackMetadata,
  detectMediaType,
  extractMetadata,
  hasOgMetadata,
  validateRedirectUrl,
} from './og-metadata.utils';

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 10_000;
const OG_METADATA_OPERATION = 'fetchOgMetadata';
const SAFE_LOOKUP_OPERATION = 'safeOgMetadataLookup';

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html, image/*, video/*, audio/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Upgrade-Insecure-Requests': '1',
};

/**
 * Crawler identity used for the single retry.
 *
 * Hosts that classify a datacenter browser identity as a bot (Reddit and other bot-walled hosts)
 * answer it with 403/429, or with a 200 client-rendered shell whose head carries no Open Graph
 * tags, while serving the same URL to known link-preview crawlers. Preview generation is what those
 * identities exist for, so the retry reuses the whole SSRF-guarded fetch path with only the
 * User-Agent changed.
 */
const CRAWLER_FETCH_HEADERS = {
  'User-Agent': 'facebookexternalhit/1.1',
  Accept: 'text/html, image/*, video/*, audio/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

type FetchInitWithDispatcher = RequestInit & { dispatcher: Dispatcher };

type TOgMetadataRetryTrigger = 'bot_wall' | 'empty_metadata';

type TOgMetadataRetry = { trigger: TOgMetadataRetryTrigger; statusCode?: number };

/**
 * One fetch attempt: its metadata, whether it produced a usable preview, and whether a crawler
 * identity is worth trying. A terminal fallback is not a successful recovery.
 */
type TOgMetadataAttempt = { result: TOgMetadataResult; usable: boolean; retry?: TOgMetadataRetry };

/**
 * Internal transport signal for an expected connection-time DNS miss.
 * This must stay outside Err.* so best-effort enrichment failures do not reach Sentry.
 */
class OgMetadataDnsError extends Error {
  constructor(cause?: unknown) {
    super('Connection-time DNS resolution failed', { cause });
    this.name = 'OgMetadataDnsError';
  }
}

/**
 * Internal transport signal for a target refused by the SSRF guard (private, loopback or
 * link-local range).
 *
 * The guard is deliberate, so this must stay outside Err.* like OgMetadataDnsError: a private
 * target is expected input, not a bug, and every scan of one must not become a Sentry group.
 * The guard still refuses the connection; only the reporting changes.
 */
class OgMetadataBlockedIpError extends Error {
  constructor() {
    super('Blocked IP range. Cannot fetch from private networks.');
    this.name = 'OgMetadataBlockedIpError';
  }
}

const SAFE_OG_METADATA_DISPATCHER: Dispatcher = new Agent({
  connect: { lookup: safeOgMetadataLookup },
});

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

    try {
      // 1. Fetch as a browser first. Bot-walled hosts answer that identity with 403/429, or with a
      // 200 shell that carries no usable metadata, while the same URL served to a crawler carries
      // the real tags, so an unusable first pass earns exactly one retry with a crawler identity.
      const attempt = await fetchOgMetadataWithHeaders(url, FETCH_HEADERS);
      if (!attempt.retry) {
        return attempt.result;
      }

      try {
        const retried = await fetchOgMetadataWithHeaders(url, CRAWLER_FETCH_HEADERS);
        // Keep the first pass's metadata, including a plain title, unless the crawler produces a
        // usable preview. A terminal failure is no improvement over another bot wall or shell.
        const result = retried.usable ? retried.result : attempt.result;
        logCrawlerRetry(url, attempt.retry, retried.usable);
        return result;
      } catch {
        // Enrichment is optional: rejected redirects or a failed retry must not discard the
        // first result. The retry still goes through every DNS, protocol and redirect guard.
        logCrawlerRetry(url, attempt.retry, false);
        return attempt.result;
      }
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
 * Runs one fetch attempt with a given identity: redirect chain, content-type gates, body read and
 * extraction. The retry decision is returned as data so the caller owns the single retry.
 */
async function fetchOgMetadataWithHeaders(url: string, headers: Record<string, string>): Promise<TOgMetadataAttempt> {
  // 1. Fetch with redirect following and two DNS checks on every hop:
  // a preflight check for IP literals/all answers, then a connection-time check that pins the socket to vetted answers.
  const fetchResult = await fetchWithRedirectsForOgMetadata(url, headers);
  if (!fetchResult.ok) {
    return { result: fallback(fetchResult.url, fetchResult.reason, fetchResult.context), usable: false };
  }
  const { response } = fetchResult;

  // 2. Handle non-OK responses. 403/429 is the classic bot wall, so it earns one crawler retry.
  if (!response.ok) {
    const result = handleErrorResponse(response, url);
    if (response.status === HttpStatusCode.FORBIDDEN || response.status === HttpStatusCode.TOO_MANY_REQUESTS) {
      return { result, usable: false, retry: { trigger: 'bot_wall', statusCode: response.status } };
    }

    return { result, usable: false };
  }

  // 3. Check for media content types (image/video/audio)
  const mediaResult = detectMediaType(url, response);
  if (mediaResult) {
    // If it's valid media content type, return result and stop fetch process
    response.body?.cancel().catch(() => {});
    return { result: mediaResult, usable: true };
  }

  // 4. Validate HTML content type
  const contentTypeOutcome = resolveHtmlContentType(response, url);
  if (contentTypeOutcome) {
    return { result: contentTypeOutcome, usable: false };
  }

  // 5. Read response body under the size cap and read deadline
  const bodyResult = await readResponseBody(response);
  if (!bodyResult.ok) {
    // The page exists but its body is unusable for enrichment: release the connection and
    // degrade to the fallback card instead of reporting an expected remote outcome.
    response.body?.cancel().catch(() => {});
    return { result: fallback(url, bodyResult.reason), usable: false };
  }

  // 6. Extract and normalize metadata. A 200 whose head has no Open Graph tags (a client-rendered
  // shell, or a bot wall served with 200) is worth one crawler retry too.
  const result = await extractMetadata(url, bodyResult.body);
  if (!isPreviewUsable(result, bodyResult.body)) {
    logFallback(url, 'empty_metadata', { statusCode: response.status });
    return { result, usable: false, retry: { trigger: 'empty_metadata', statusCode: response.status } };
  }

  return { result, usable: true };
}

/**
 * Whether the extracted metadata gives the preview card something to show.
 *
 * A page whose head has no Open Graph tags at all is not a preview even when it carries a plain
 * `<title>`: that is the shape a client-rendered shell takes when the browser identity is
 * bot-walled, while the crawler identity serves the real tags.
 */
function isPreviewUsable(result: TOgMetadataResult, html: string): boolean {
  if (result.image) return true;
  if (!result.title) return false;

  return hasOgMetadata(html);
}

function logCrawlerRetry(url: string, retry: TOgMetadataRetry, recovered: boolean): void {
  Logger.warn('[og-metadata:fetch]', {
    outcome: 'crawler_retry',
    trigger: retry.trigger,
    recovered,
    hostname: getHostname(url),
    ...(retry.statusCode ? { statusCode: retry.statusCode } : {}),
  });
}

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
async function fetchWithRedirectsForOgMetadata(url: string, headers: Record<string, string>): Promise<OgFetchResult> {
  let currentUrl = url;

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const fetchResult = await fetchForOgMetadata(currentUrl, {
      headers,
      redirect: 'manual', // Disable automatic redirects so we can validate each hop (DNS + protocol) ourselves
    });
    if (!fetchResult.ok) return fetchResult;

    const { response } = fetchResult;
    let redirectUrl: URL | null;
    try {
      redirectUrl = validateRedirectUrl(response, currentUrl);
    } catch (error) {
      response.body?.cancel().catch(() => {});
      throw error;
    }
    if (!redirectUrl) {
      return { ok: true, response };
    }

    // Release the redirect response body before following the next hop so the TCP connection can be reused promptly.
    response.body?.cancel().catch(() => {});

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
      reason: Extract<TOgMetadataFallbackReason, 'dns_failed' | 'blocked_ip' | 'network' | 'timeout'>;
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

function getHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

async function fetchForOgMetadata(url: string, options: RequestInit): Promise<OgFetchResult> {
  const hostname = new URL(url).hostname;
  const dnsResult = await checkDnsSafety(hostname);
  if (!dnsResult.ok) {
    if (dnsResult.reason === 'unsafe_ip') {
      return { ok: false, reason: 'blocked_ip', url, context: { hostname } };
    }

    return { ok: false, reason: dnsResult.reason, url, context: { hostname } };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      dispatcher: SAFE_OG_METADATA_DISPATCHER,
    } as FetchInitWithDispatcher);
    return { ok: true, response };
  } catch (error) {
    const appError = findErrorInCauseChain(error, (candidate): candidate is AppError => candidate instanceof AppError);
    if (appError) {
      throw appError;
    }

    const blockedIpError = findErrorInCauseChain(
      error,
      (candidate): candidate is OgMetadataBlockedIpError => candidate instanceof OgMetadataBlockedIpError,
    );
    if (blockedIpError) {
      return { ok: false, reason: 'blocked_ip', url, context: { hostname, errorName: blockedIpError.name } };
    }

    const dnsError = findErrorInCauseChain(
      error,
      (candidate): candidate is OgMetadataDnsError => candidate instanceof OgMetadataDnsError,
    );
    if (dnsError) {
      return {
        ok: false,
        reason: 'dns_failed',
        url,
        context: { errorName: dnsError.name },
      };
    }

    const abortError = findErrorInCauseChain(error, isAbortError);
    return {
      ok: false,
      reason: abortError ? 'timeout' : 'network',
      url,
      context: { errorName: getErrorName(abortError ?? error) },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function safeOgMetadataLookup(...[hostname, options, callback]: Parameters<LookupFunction>): void {
  void (async () => {
    try {
      const dnsResult = await checkDnsSafety(hostname);
      if (!dnsResult.ok) {
        if (dnsResult.reason === 'unsafe_ip') {
          callback(new OgMetadataBlockedIpError(), '');
          return;
        }

        callback(new OgMetadataDnsError(dnsResult.cause), '');
        return;
      }

      const requestedFamily = normalizeRequestedIpFamily(options.family);
      const addresses = dnsResult.addresses.filter(({ family }) => !requestedFamily || requestedFamily === family);
      if (addresses.length === 0) {
        callback(new OgMetadataDnsError(), '');
        return;
      }

      if (options.all) {
        callback(null, addresses);
        return;
      }

      const [address] = addresses;
      callback(null, address.address, address.family);
    } catch (error) {
      callback(
        error instanceof AppError
          ? error
          : Err.server(ServerErrorCode.UNKNOWN_ERROR, 'Connection-time DNS safety check failed', {
              service: ErrorService.NextJsServer,
              operation: SAFE_LOOKUP_OPERATION,
              cause: error,
              context: { hostname },
            }),
        '',
      );
    }
  })();
}

function findErrorInCauseChain<T>(error: unknown, predicate: (candidate: unknown) => candidate is T): T | null {
  const seen = new Set<unknown>();
  let candidate = error;

  while (candidate && typeof candidate === 'object' && !seen.has(candidate)) {
    if (predicate(candidate)) return candidate;

    seen.add(candidate);
    candidate = 'cause' in candidate ? candidate.cause : undefined;
  }

  return null;
}

function isAbortError(error: unknown): error is { name: string } {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

function getErrorName(error: unknown): string | undefined {
  if (error instanceof Error) return error.name;
  if (typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string') {
    return error.name;
  }

  return undefined;
}

function normalizeRequestedIpFamily(family: number | string | undefined): 4 | 6 | undefined {
  if (family === 4 || family === 'IPv4') return 4;
  if (family === 6 || family === 'IPv6') return 6;
  return undefined;
}
