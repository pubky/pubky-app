import * as Core from '@/core';
import * as Libs from '@/libs';
import { truncateString, truncateMiddle, decodeHtmlEntities } from '@/libs/utils';
import { isIpSafe } from '@/libs/network';
import { OG_PATTERNS, extractFromHtml } from '@/libs/html';
import { URL_TRUNCATE_LENGTH, TITLE_TRUNCATE_LENGTH } from '@/config';

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
const MEDIA_TYPES = ['image', 'video', 'audio'] as const;

/**
 * OG metadata application service.
 *
 * Orchestrates OG metadata fetching workflow:
 * 1. Resolves DNS and validates IP (SSRF protection)
 * 2. Fetches URL via NextJsApiService
 * 3. Handles response status and content type
 * 4. Parses HTML for OG metadata
 * 5. Normalizes and validates image URLs (SSRF protection)
 */
export class OgMetadataApplication {
  private constructor() {}

  /**
   * Fetch and extract OG metadata from a validated URL.
   *
   * @param validatedUrl - Parsed and validated URL from the pipes layer
   * @returns Normalized OG metadata result
   * @throws AppError on DNS failure, blocked IP, fetch failure, or invalid content
   */
  static async fetch(validatedUrl: URL): Promise<Core.TOgMetadataResult> {
    const url = validatedUrl.toString();

    try {
      // 1. Resolve DNS and validate IP (prevents SSRF via DNS rebinding)
      await this.validateDns(validatedUrl.hostname);

      // 2. Fetch via service layer (follows redirects with DNS validation on each hop)
      const response = await this.fetchWithRedirects(url);

      // 3. Handle non-OK responses
      if (!response.ok) {
        return this.handleErrorResponse(url, response.status);
      }

      // 4. Check for media content types (image/video/audio)
      const mediaResult = this.detectMediaType(url, response);
      if (mediaResult) return mediaResult;

      // 5. Validate HTML content type
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('text/html')) {
        throw Libs.Err.validation(Libs.ValidationErrorCode.INVALID_INPUT, 'Not HTML content', {
          service: Libs.ErrorService.NextJsApi,
          operation: 'fetch',
          context: { contentType, statusCode: 400 },
        });
      }

      // 6. Read response body with size limit
      const html = await this.readResponseBody(response);

      // 7. Extract and normalize metadata
      return this.extractMetadata(url, html);
    } catch (error) {
      if (error instanceof Libs.AppError) {
        throw error;
      }

      throw Libs.Err.server(Libs.ServerErrorCode.UNKNOWN_ERROR, 'Failed to fetch OG metadata', {
        service: Libs.ErrorService.NextJsApi,
        operation: 'fetch',
        cause: error,
        context: { url, statusCode: 500 },
      });
    }
  }

  /**
   * Resolves DNS for hostname and validates the resolved IP is safe.
   * Prevents SSRF attacks by checking IP before the actual fetch.
   */
  private static async validateDns(hostname: string): Promise<void> {
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
            service: Libs.ErrorService.NextJsApi,
            operation: 'validateDns',
            context: { hostname, statusCode: 400 },
          });
        }
        resolvedIp = addresses[0];
      }
    } catch (error) {
      if (error instanceof Libs.AppError) throw error;

      throw Libs.Err.network(Libs.NetworkErrorCode.DNS_FAILED, 'DNS resolution failed', {
        service: Libs.ErrorService.NextJsApi,
        operation: 'validateDns',
        cause: error,
        context: { hostname, statusCode: 400 },
      });
    }

    // Reject private/reserved IP ranges to prevent SSRF (e.g. localhost, 10.x, 192.168.x).
    if (!isIpSafe(resolvedIp)) {
      throw Libs.Err.auth(Libs.AuthErrorCode.FORBIDDEN, 'Blocked IP range. Cannot fetch from private networks.', {
        service: Libs.ErrorService.NextJsApi,
        operation: 'validateDns',
        context: { hostname, statusCode: 403 },
      });
    }
  }

  /**
   * Follows redirects manually, validating DNS on each hop to prevent SSRF via open redirects.
   */
  private static async fetchWithRedirects(url: string): Promise<Response> {
    let currentUrl = url;

    for (let i = 0; i < MAX_REDIRECTS; i++) {
      const response = await Core.NextJsApiService.fetch(currentUrl);

      if (response.status < 300 || response.status >= 400) {
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
        throw Libs.Err.auth(Libs.AuthErrorCode.FORBIDDEN, 'Blocked redirect to non-HTTP protocol', {
          service: Libs.ErrorService.NextJsApi,
          operation: 'fetchWithRedirects',
          context: { protocol: redirectUrl.protocol, statusCode: 403 },
        });
      }

      await this.validateDns(redirectUrl.hostname);

      currentUrl = redirectUrl.toString();
    }

    throw Libs.Err.network(Libs.NetworkErrorCode.CONNECTION_FAILED, 'Too many redirects', {
      service: Libs.ErrorService.NextJsApi,
      operation: 'fetchWithRedirects',
      context: { url, statusCode: 400 },
    });
  }

  /**
   * Handles non-OK HTTP responses.
   * Returns fallback metadata for 403 (upstream blocks bots).
   * Throws for all other error statuses.
   */
  private static handleErrorResponse(url: string, status: number): Core.TOgMetadataResult {
    if (status === 403) {
      return this.buildFallbackMetadata(url);
    }

    throw Libs.Err.server(Libs.ServerErrorCode.UNKNOWN_ERROR, 'Fetch failed', {
      service: Libs.ErrorService.NextJsApi,
      operation: 'fetch',
      context: { url, statusCode: status },
    });
  }

  /**
   * Detects media content types (image/video/audio) and returns early.
   * Returns null if content is not a media type.
   */
  private static detectMediaType(url: string, response: Response): Core.TOgMetadataResult | null {
    const contentType = response.headers.get('content-type');

    for (const type of MEDIA_TYPES) {
      if (contentType?.startsWith(type)) {
        return { url, type };
      }
    }

    return null;
  }

  /**
   * Reads response body with a 5MB size limit using stream reader.
   * Content-Length headers can be spoofed, so we enforce the limit by reading the stream.
   */
  private static async readResponseBody(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw Libs.Err.validation(Libs.ValidationErrorCode.INVALID_INPUT, 'No response body', {
        service: Libs.ErrorService.NextJsApi,
        operation: 'readResponseBody',
        context: { statusCode: 400 },
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
            service: Libs.ErrorService.NextJsApi,
            operation: 'readResponseBody',
            context: { totalBytes, statusCode: 413 },
          });
        }

        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof Libs.AppError) throw error;

      throw Libs.Err.server(Libs.ServerErrorCode.UNKNOWN_ERROR, 'Failed to read response body', {
        service: Libs.ErrorService.NextJsApi,
        operation: 'readResponseBody',
        cause: error,
        context: { statusCode: 500 },
      });
    }

    return new TextDecoder().decode(Buffer.concat(chunks));
  }

  /**
   * Extracts OG metadata from HTML, normalizes image URLs, and applies truncation.
   */
  private static async extractMetadata(url: string, html: string): Promise<Core.TOgMetadataResult> {
    // Extract title (og:title → <title> fallback)
    const ogTitle = extractFromHtml(html, OG_PATTERNS.TITLE);
    const titleTag = html.match(OG_PATTERNS.TITLE_TAG)?.[1] || null;
    const rawTitle = ogTitle || titleTag;
    const title = rawTitle ? decodeHtmlEntities(rawTitle) : null;

    // Extract og:image
    const image = extractFromHtml(html, OG_PATTERNS.IMAGE);

    // Normalize and validate image URL
    const normalizedImage = image ? await this.normalizeImageUrl(image, url) : null;

    return {
      url: truncateMiddle(url, URL_TRUNCATE_LENGTH),
      title: title ? truncateString(title.trim(), TITLE_TRUNCATE_LENGTH) : null,
      image: normalizedImage,
      type: 'website',
    };
  }

  /**
   * Normalizes a relative image URL to absolute and validates it against SSRF.
   * Returns null if the image URL is invalid, uses a non-HTTP protocol, or resolves to a private IP.
   */
  private static async normalizeImageUrl(image: string, baseUrl: string): Promise<string | null> {
    try {
      const imageUrl = new URL(image, baseUrl);

      if (!['http:', 'https:'].includes(imageUrl.protocol)) {
        return null;
      }

      // Resolve and validate image hostname DNS
      // webpack bundles Node.js ONLY modules into client code via barrel imports
      // (e.g., FilterContent.tsx's `import * as Core from '@/core'`). See #1435.
      const { isIP } = await import(/* webpackIgnore: true */ 'net');
      const dns = await import(/* webpackIgnore: true */ 'dns/promises');
      const imageHostname = imageUrl.hostname.toLowerCase();
      let imageIp: string;

      if (isIP(imageHostname)) {
        imageIp = imageHostname;
      } else {
        try {
          const imageAddresses = await dns.resolve4(imageHostname);
          imageIp = imageAddresses[0];
        } catch {
          return null;
        }
      }

      if (!imageIp || !isIpSafe(imageIp)) {
        return null;
      }

      return imageUrl.toString();
    } catch {
      return null;
    }
  }

  /**
   * Builds fallback metadata when the upstream returns 403 or other non-fatal errors.
   */
  private static buildFallbackMetadata(url: string): Core.TOgMetadataResult {
    return {
      url: truncateMiddle(url, URL_TRUNCATE_LENGTH),
      title: null,
      image: null,
      type: 'website',
    };
  }
}
