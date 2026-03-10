import * as Libs from '@/libs';
import { truncateString, truncateMiddle, decodeHtmlEntities } from '@/libs/utils';
import { OG_PATTERNS, extractFromHtml } from '@/libs/html';
import { URL_TRUNCATE_LENGTH, TITLE_TRUNCATE_LENGTH } from '@/config';
import { validateDns, fetchWithRedirects, readResponseBody, normalizeImageUrl } from '../nextjs.utils';
import type { TOgMetadataResult } from '@/core/application/og-metadata/og-metadata.types';

const MEDIA_TYPES = ['image', 'video', 'audio'] as const;

/**
 * Fetches and extracts OG metadata from a URL.
 * Orchestrates DNS validation, redirect following, content parsing.
 *
 * @param url - The URL string to fetch
 * @param hostname - The hostname for DNS validation
 * @returns Normalized OG metadata result
 */
export async function fetchOgMetadata(url: string, hostname: string): Promise<TOgMetadataResult> {
  try {
    // 1. Resolve DNS and validate IP (prevents SSRF via DNS rebinding)
    await validateDns(hostname);

    // 2. Fetch with redirect following and DNS validation on each hop
    const response = await fetchWithRedirects(url);

    // 3. Handle non-OK responses
    if (!response.ok) {
      response.body?.cancel().catch(() => {}); // cancel the response body to release the TCP connection back to the pool
      // 403: upstream blocks bots — return fallback metadata
      if (response.status === Libs.HttpStatusCode.FORBIDDEN) {
        return buildFallbackMetadata(url);
      }
      throw Libs.httpResponseToError(response, Libs.ErrorService.NextJsServer, 'fetch', url);
    }

    // 4. Check for media content types (image/video/audio)
    const mediaResult = detectMediaType(url, response);
    if (mediaResult) {
      response.body?.cancel().catch(() => {});
      return mediaResult;
    }

    // 5. Validate HTML content type
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('text/html')) {
      response.body?.cancel().catch(() => {});
      throw Libs.Err.validation(Libs.ValidationErrorCode.INVALID_INPUT, 'Not HTML content', {
        service: Libs.ErrorService.NextJsServer,
        operation: 'fetch',
        context: { contentType, statusCode: Libs.HttpStatusCode.BAD_REQUEST },
      });
    }

    // 6. Read response body with size limit
    const html = await readResponseBody(response);

    // 7. Extract and normalize metadata
    return extractMetadata(url, html);
  } catch (error) {
    if (error instanceof Libs.AppError) {
      throw error;
    }

    throw Libs.Err.server(Libs.ServerErrorCode.UNKNOWN_ERROR, 'Failed to fetch OG metadata', {
      service: Libs.ErrorService.NextJsServer,
      operation: 'fetch',
      cause: error,
      context: { url, statusCode: Libs.HttpStatusCode.INTERNAL_SERVER_ERROR },
    });
  }
}

/**
 * Detects media content types (image/video/audio) and returns early.
 * Returns null if content is not a media type.
 */
function detectMediaType(url: string, response: Response): TOgMetadataResult | null {
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
async function extractMetadata(url: string, html: string): Promise<TOgMetadataResult> {
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
function buildFallbackMetadata(url: string): TOgMetadataResult {
  return {
    url: truncateMiddle(url, URL_TRUNCATE_LENGTH),
    title: null,
    image: null,
    type: 'website',
  };
}
