import { NextRequest, NextResponse } from 'next/server';
import { ImageController, type TImageControllerResult } from '@/controllers/image/image';
import { IMAGE_RESPONSE_HEADERS } from '@/libs/api/image-response';
import { HttpStatusCode } from '@/libs/http/http.types';

/**
 * A Pinakes card's image, a link preview's, or a YouTube thumbnail, served from the app's origin: cards,
 * link previews and the visual timeline show their images without the viewer's browser asking the
 * image's host (`getResourceImageUrl`, `getCardPreviewImageUrl`, `getLinkImageUrl`,
 * `getYouTubeThumbnailUrl`). Takes what carries the image and one image of it:
 * `?uri=<card link>&src=<image>` (with `&episode=<title>` for a show's episode art, or `&og=1` for a
 * card's own preview image when it has none), `?link=<link with no card>&src=<its og:image>` (the page
 * `/api/og-metadata` reads anyway), `?xpost=<X post ID>&src=<one of its images>` (only a photo or video
 * still of that post as the app's server read it, `/api/x-post`), or `?youtube=<video id>&variant=hq720|mqdefault` (`i.ytimg.com`
 * only). The image is read only when that settled card, or that page's preview, carries it
 * (`ImageApplication`): the route reads no address a caller names alone. What remains is that any
 * public raster image a real card or page names can be read through the app, within the route's caps.
 * Its budgets are per server instance and there is no limit per client (a forwarded address can be
 * spoofed here): a deployment limits `/api/image` per client at its edge, keyed by the address its own
 * proxy trusts.
 *
 * The image is served as the type its bytes are (JPEG, PNG, WebP or GIF), never as script or a
 * document: no sniffing, a sandboxing policy, and same-origin use only. Images change rarely: a day in
 * the browser and on the CDN. A card or image with nothing to serve is cached for five minutes, input
 * the route never reads for a day. While Pinakes, the page or the image host fails (502), or the route
 * is busy (503), the answer is never cached, so the next view asks again.
 */
const IMAGE_CACHE = 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400';
const MISS_CACHE = 'public, max-age=300, s-maxage=300';
const REFUSED_CACHE = 'public, max-age=86400, s-maxage=86400';
const FAILED_CACHE = 'no-store';

type TFailureStatus = Extract<TImageControllerResult, { ok: false }>['statusCode'];
const FAILURE_CACHE: Record<TFailureStatus, string> = {
  [HttpStatusCode.BAD_REQUEST]: REFUSED_CACHE,
  [HttpStatusCode.NOT_FOUND]: MISS_CACHE,
  [HttpStatusCode.BAD_GATEWAY]: FAILED_CACHE,
  [HttpStatusCode.SERVICE_UNAVAILABLE]: FAILED_CACHE,
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const result = await ImageController.fetch({
      uri: searchParams.get('uri'),
      link: searchParams.get('link'),
      src: searchParams.get('src'),
      episode: searchParams.get('episode'),
      og: searchParams.get('og'),
      xpost: searchParams.get('xpost'),
      youtube: searchParams.get('youtube'),
      variant: searchParams.get('variant'),
    });
    if (!result.ok) {
      return new NextResponse(null, {
        status: result.statusCode,
        headers: { ...IMAGE_RESPONSE_HEADERS, 'Cache-Control': FAILURE_CACHE[result.statusCode] },
      });
    }
    return new NextResponse(result.image.body, {
      status: 200,
      headers: {
        ...IMAGE_RESPONSE_HEADERS,
        'Content-Type': result.image.contentType,
        'Content-Length': String(result.image.body.byteLength),
        'Cache-Control': IMAGE_CACHE,
      },
    });
  } catch {
    // Every expected failure is answered above; anything else is an empty 500, never an error text.
    return new NextResponse(null, {
      status: HttpStatusCode.INTERNAL_SERVER_ERROR,
      headers: { ...IMAGE_RESPONSE_HEADERS, 'Cache-Control': FAILED_CACHE },
    });
  }
}
