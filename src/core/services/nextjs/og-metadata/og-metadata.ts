import {
  Err,
  AppError,
  ValidationErrorCode,
  ServerErrorCode,
  NetworkErrorCode,
  ErrorService,
  HttpStatusCode,
  httpResponseToError,
  safeFetch,
} from '@/libs';
import { validateDns, readResponseBody } from '../nextjs.utils';
import { detectMediaType, extractMetadata, buildFallbackMetadata, validateRedirectUrl } from './og-metadata.utils';
import type { TOgMetadataResult } from '@/core/application/og-metadata/og-metadata.types';

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
  static async fetch(validatedUrl: URL): Promise<TOgMetadataResult> {
    const url = validatedUrl.toString();
    const hostname = validatedUrl.hostname;

    try {
      // 1. Resolve DNS and validate IP (prevents SSRF via DNS rebinding)
      await validateDns(hostname);

      // 2. Fetch with redirect following and DNS validation on each hop
      const response = await fetchWithRedirects(url);

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
      validateHtmlContentType(response);

      // 6. Read response body with size limit
      const html = await readResponseBody(response);

      // 7. Extract and normalize metadata
      return extractMetadata(url, html);
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
 * Handles non-OK responses: returns fallback metadata for 403, throws for all others.
 * Cancels the response body to release the TCP connection back to the pool.
 */
function handleErrorResponse(response: Response, url: string): TOgMetadataResult {
  response.body?.cancel().catch(() => {});
  if (response.status === HttpStatusCode.FORBIDDEN) {
    return buildFallbackMetadata(url);
  }
  throw httpResponseToError(response, ErrorService.NextJsServer, 'fetchOgMetadata', url);
}

/**
 * Validates that the response has an HTML content type.
 * Cancels the response body and throws a validation error if not HTML.
 */
function validateHtmlContentType(response: Response): void {
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('text/html')) {
    response.body?.cancel().catch(() => {});
    throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Not HTML content', {
      service: ErrorService.NextJsServer,
      operation: 'fetchOgMetadata',
      context: { contentType, statusCode: HttpStatusCode.BAD_REQUEST },
    });
  }
}

/**
 * Follows redirects manually, validating DNS on each hop to prevent SSRF via open redirects.
 * Uses safeFetch for standardized network error handling.
 */
async function fetchWithRedirects(url: string): Promise<Response> {
  let currentUrl = url;

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await safeFetch(
        currentUrl,
        {
          signal: controller.signal,
          headers: FETCH_HEADERS,
          redirect: 'manual', // Disable automatic redirects so we can validate each hop (DNS + protocol) ourselves
        },
        ErrorService.NextJsServer,
        'fetchOgMetadata',
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const redirectUrl = validateRedirectUrl(response, currentUrl);
    if (!redirectUrl) {
      return response;
    }

    // Release the redirect response body before following the next hop so the TCP connection can be reused promptly.
    response.body?.cancel().catch(() => {});

    await validateDns(redirectUrl.hostname);

    currentUrl = redirectUrl.toString();
  }

  throw Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Too many redirects', {
    service: ErrorService.NextJsServer,
    operation: 'fetchWithRedirects',
    context: { url, statusCode: HttpStatusCode.BAD_REQUEST },
  });
}
