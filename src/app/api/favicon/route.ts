import { NextRequest, NextResponse } from 'next/server';
import { FaviconController } from '@/controllers/favicon/favicon';
import { handleApiError } from '@/libs/api/route-error-handler';

/**
 * A site's icon, served from the app's origin: cards and service menus show site icons without
 * the viewer's browser asking each site (`getFaviconRouteUrl`). Takes a host name only
 * (`?host=open.spotify.com`); the server picks the one address it reads (`getFaviconSource`).
 *
 * The icon is served as the image type its bytes are, never as script or a document: no sniffing,
 * a sandboxing policy, and same-origin use only. Icons change rarely: a day in the browser, a week
 * on the CDN. A host with no icon is cached for an hour, a refused one for a day. While too many
 * other sites are being read the answer is 503, never cached, so the next view asks again.
 */
const SAFE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'Cross-Origin-Resource-Policy': 'same-origin',
};
const ICON_CACHE = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400';
const MISS_CACHE = 'public, max-age=3600, s-maxage=3600';
const REFUSED_CACHE = 'public, max-age=86400, s-maxage=86400';
const BUSY_CACHE = 'no-store';

const FAILURE_CACHE: Record<number, string> = { 404: MISS_CACHE, 503: BUSY_CACHE };

export async function GET(request: NextRequest) {
  try {
    const result = await FaviconController.fetch({ host: request.nextUrl.searchParams.get('host') });
    if (!result.ok) {
      return new NextResponse(null, {
        status: result.statusCode,
        headers: { ...SAFE_HEADERS, 'Cache-Control': FAILURE_CACHE[result.statusCode] ?? REFUSED_CACHE },
      });
    }
    return new NextResponse(result.icon.body, {
      status: 200,
      headers: {
        ...SAFE_HEADERS,
        'Content-Type': result.icon.contentType,
        'Content-Length': String(result.icon.body.byteLength),
        'Cache-Control': ICON_CACHE,
      },
    });
  } catch (error) {
    return handleApiError(error, 'api.favicon.GET', {
      unknownErrorMessage: 'Internal server error',
    });
  }
}
