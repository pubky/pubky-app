import { URL_TRUNCATE_LENGTH, TITLE_TRUNCATE_LENGTH } from '@/config';
import { normalizeImageUrl, isHttpProtocol } from '../nextjs.utils';
import type { TOgMetadataResult } from '@/core/application/og-metadata/og-metadata.types';
import { extractFromHtml, OG_PATTERNS } from '@/libs/html/html';
import { HttpStatusCode } from '@/libs/http/http.types';
import { decodeHtmlEntities, truncateMiddle, truncateString } from '@/libs/utils/utils';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

const MEDIA_TYPES = ['image', 'video', 'audio'] as const;

/**
 * Detects media content types (image/video/audio) and returns early.
 * Returns null if content is not a media type.
 */
export function detectMediaType(url: string, response: Response): TOgMetadataResult | null {
  const contentType = response.headers.get('content-type');

  for (const type of MEDIA_TYPES) {
    if (contentType?.startsWith(type)) {
      return { url, type };
    }
  }

  return null;
}

/**
 * Extracts OG metadata from HTML, normalizes image URLs, and applies truncation.
 */
export async function extractMetadata(url: string, html: string): Promise<TOgMetadataResult> {
  // Extract title (og:title → <title> fallback)
  const ogTitle = extractFromHtml(html, OG_PATTERNS.TITLE);
  const titleTag = html.match(OG_PATTERNS.TITLE_TAG)?.[1] || null;
  const rawTitle = ogTitle || titleTag;
  const title = rawTitle ? decodeHtmlEntities(rawTitle) : null;

  // Extract og:image
  const image = extractFromHtml(html, OG_PATTERNS.IMAGE);

  // Normalize and validate image URL
  const normalizedImage = image ? await normalizeImageUrl(image, url) : null;

  return {
    url: truncateMiddle(url, URL_TRUNCATE_LENGTH),
    title: title ? truncateString(title.trim(), TITLE_TRUNCATE_LENGTH) : null,
    image: normalizedImage,
    type: 'website',
  };
}

/**
 * Builds fallback metadata when the upstream returns 403 or other non-fatal errors.
 */
export function buildFallbackMetadata(url: string): TOgMetadataResult {
  return {
    url: truncateMiddle(url, URL_TRUNCATE_LENGTH),
    title: null,
    image: null,
    type: 'website',
  };
}

/**
 * Extracts and validates the redirect target from a response.
 *
 * Returns null if the response is not a redirect (non-3xx) or has no Location header.
 * Throws if the redirect target uses a non-HTTP protocol (SSRF prevention).
 *
 * @param response - The HTTP response to inspect
 * @param currentUrl - The current URL, used as base for resolving relative Location headers
 * @returns The validated redirect URL, or null if not a redirect
 */
export function validateRedirectUrl(response: Response, currentUrl: string): URL | null {
  // 1. Non-redirect status codes: treat as final response
  if (response.status < 300 || response.status >= 400) {
    // e.g. 200, 404, 500, etc.
    return null;
  }

  const location = response.headers.get('location');
  // 2. 3xx without Location is invalid/malformed; treat as final response.
  if (!location) {
    return null;
  }

  const redirectUrl = new URL(location, currentUrl);
  // 3. Must be HTTP or HTTPS to prevent SSRF via redirect to non-HTTP protocols.
  if (!isHttpProtocol(redirectUrl)) {
    throw Err.auth(AuthErrorCode.FORBIDDEN, 'Blocked redirect to non-HTTP protocol', {
      service: ErrorService.NextJsServer,
      operation: 'fetchWithRedirects',
      context: { protocol: redirectUrl.protocol, statusCode: HttpStatusCode.FORBIDDEN },
    });
  }

  return redirectUrl;
}
