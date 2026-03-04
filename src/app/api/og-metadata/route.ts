import { NextRequest, NextResponse } from 'next/server';
import dns from 'dns/promises';
import { isIP } from 'net';
import * as Libs from '@/libs';
import { truncateString, truncateMiddle, decodeHtmlEntities } from '@/libs/utils';
import { isIpSafe } from '@/libs/network';
import { OG_PATTERNS, extractFromHtml } from '@/libs/html';
import { URL_TRUNCATE_LENGTH } from '@/config';

/**
 * API Route for secure OpenGraph metadata fetching
 *
 * This endpoint prevents SSRF attacks via DNS rebinding by:
 * 1. Resolving DNS to IP address BEFORE fetching
 * 2. Validating the resolved IP against private ranges
 * 3. Using stream reading to enforce real size limits
 * 4. Validating content types and response headers
 *
 * Uses GET method to enable HTTP caching on CDN/Edge
 *
 * @see docs/adr/XXXX-secure-og-metadata-fetching.md (TODO: Create ADR)
 */

const CACHE_HEADERS = {
  headers: {
    // Cache for 1 hour on CDN, stale-while-revalidate for 24 hours
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  },
};

function buildFallbackMetadata(url: string, maxLength = URL_TRUNCATE_LENGTH) {
  return {
    url: truncateMiddle(url, maxLength),
    title: null,
    image: null,
    type: 'website' as const,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    // 1. Validate URL format
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: 'Malformed URL' }, { status: 400 });
    }

    // 2. Block dangerous protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Invalid protocol. Only HTTP and HTTPS are allowed.' }, { status: 400 });
    }

    // 3. Validate hostname structure (must have domain and TLD)
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || hostname.trim() === '') {
      return NextResponse.json({ error: 'Invalid hostname. URL must include a domain name.' }, { status: 400 });
    }

    // 4. Allow IP addresses and localhost, but validate domain structure for others
    if (!isIP(hostname) && hostname !== 'localhost') {
      // Check if hostname ends with a dot (invalid)
      if (hostname.endsWith('.')) {
        return NextResponse.json(
          { error: 'Invalid hostname. Domain must include a top-level domain (TLD).' },
          { status: 400 },
        );
      }

      // Check if hostname has at least one dot (required for TLD)
      const parts = hostname.split('.');
      if (parts.length < 2) {
        return NextResponse.json(
          { error: 'Invalid hostname. Domain must include a top-level domain (TLD).' },
          { status: 400 },
        );
      }

      // Check if TLD is at least 2 characters (e.g., .com, .uk, .io)
      const tld = parts[parts.length - 1];
      if (!tld || tld.length < 2) {
        return NextResponse.json(
          { error: 'Invalid hostname. Top-level domain (TLD) must be at least 2 characters.' },
          { status: 400 },
        );
      }

      // Check if domain part (before TLD) is not empty
      const domain = parts.slice(0, -1).join('.');
      if (!domain || domain.trim() === '') {
        return NextResponse.json({ error: 'Invalid hostname. Domain name cannot be empty.' }, { status: 400 });
      }
    }

    // 5. Block Tor .onion addresses (they require Tor network and will always fail)
    if (hostname.endsWith('.onion')) {
      return NextResponse.json({ error: 'Tor .onion addresses are not supported.' }, { status: 400 });
    }

    // 6. Resolve DNS and validate IP BEFORE fetch (prevents DNS rebinding)
    let resolvedIp: string;

    try {
      // If hostname is already an IP address, use it directly
      if (isIP(hostname)) {
        resolvedIp = hostname;
      } else {
        // Resolve DNS to get the actual IP address
        const addresses = await dns.resolve4(hostname);
        if (!addresses || addresses.length === 0) {
          return NextResponse.json({ error: 'DNS resolution failed' }, { status: 400 });
        }
        resolvedIp = addresses[0];
      }
    } catch (error) {
      Libs.Logger.error('DNS resolution failed:', error);
      return NextResponse.json({ error: 'DNS resolution failed' }, { status: 400 });
    }

    // 7. Validate the resolved IP address
    if (!isIpSafe(resolvedIp)) {
      return NextResponse.json({ error: 'Blocked IP range. Cannot fetch from private networks.' }, { status: 403 });
    }

    // 8. Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'text/html, image/*, video/*, audio/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Upgrade-Insecure-Requests': '1',
        },
        redirect: 'follow',
      });
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        return NextResponse.json({ error: 'Request timeout' }, { status: 408 });
      }
      return NextResponse.json({ error: 'Fetch failed' }, { status: 500 });
    }

    clearTimeout(timeoutId);

    // 9. Validate response status
    if (!response.ok) {
      if (response.status === 403) {
        return NextResponse.json(buildFallbackMetadata(url), CACHE_HEADERS);
      }

      return NextResponse.json({ error: 'Fetch failed' }, { status: response.status });
    }

    // 10. Validate content-type
    const contentType = response.headers.get('content-type');
    const mediaTypes = ['image', 'video', 'audio'];
    const foundMediaType = mediaTypes.find((type) => contentType?.startsWith(type));

    if (foundMediaType) {
      return NextResponse.json({ url, type: foundMediaType }, CACHE_HEADERS);
    }

    if (!contentType?.includes('text/html')) {
      return NextResponse.json({ error: 'Not HTML content' }, { status: 400 });
    }

    // 11. Limit response size using stream reader (enforces REAL size limit)
    // Note: content-length header can be spoofed, so we read the stream manually
    const reader = response.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: 'No response body' }, { status: 400 });
    }

    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    let totalBytes = 0;
    const chunks: Uint8Array[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalBytes += value.byteLength;
        if (totalBytes > MAX_SIZE) {
          await reader.cancel();
          return NextResponse.json({ error: 'Response too large (max 5MB)' }, { status: 413 });
        }

        chunks.push(value);
      }
    } catch (error) {
      Libs.Logger.error('Failed to read response body:', error);
      return NextResponse.json({ error: 'Failed to read response body' }, { status: 500 });
    }

    // 12. Decode HTML
    const html = new TextDecoder().decode(Buffer.concat(chunks));

    // 13. Parse metadata using regex (lighter than cheerio)
    const ogTitle = extractFromHtml(html, OG_PATTERNS.TITLE);
    const titleTag = html.match(OG_PATTERNS.TITLE_TAG)?.[1] || null;
    const rawTitle = ogTitle || titleTag;
    const title = rawTitle ? decodeHtmlEntities(rawTitle) : null;

    // Extract og:image
    const image = extractFromHtml(html, OG_PATTERNS.IMAGE);

    // 14. Normalize and validate image URL (must also be safe)
    let normalizedImage: string | null = null;
    if (image) {
      try {
        // Convert relative URLs to absolute
        const imageUrl = new URL(image, url);

        // Only allow HTTP/HTTPS for images
        if (!['http:', 'https:'].includes(imageUrl.protocol)) {
          normalizedImage = null;
        } else {
          // Resolve and validate image URL DNS as well
          const imageHostname = imageUrl.hostname.toLowerCase();
          let imageIp: string;

          if (isIP(imageHostname)) {
            imageIp = imageHostname;
          } else {
            try {
              const imageAddresses = await dns.resolve4(imageHostname);
              imageIp = imageAddresses[0];
            } catch {
              // DNS resolution failed for image, skip it
              imageIp = '';
            }
          }

          if (imageIp && isIpSafe(imageIp)) {
            normalizedImage = imageUrl.toString();
          }
        }
      } catch {
        // Invalid image URL format
        normalizedImage = null;
      }
    }

    // 15. Return normalized metadata with truncation and cache headers
    return NextResponse.json(
      {
        url: truncateMiddle(url, 40), // Truncate URL with "..." in the middle (max 40 chars)
        title: title ? truncateString(title.trim(), 50) : null, // Truncate title with "..." at the end (max 50 chars)
        image: normalizedImage,
        type: 'website',
      },
      CACHE_HEADERS,
    );
  } catch (error) {
    return Libs.handleApiError(error, 'api.og-metadata.GET', {
      unknownErrorMessage: 'Internal server error',
    });
  }
}
