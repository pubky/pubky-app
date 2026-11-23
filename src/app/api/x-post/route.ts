import { NextRequest, NextResponse } from 'next/server';
import { type TXPostControllerResult, XPostController } from '@/controllers/x-post/x-post';
import { HttpStatusCode } from '@/libs/http/http.types';

/**
 * One X post read by the app's server (`?id=<post ID>`, digits only), for a post a Pinakes card cannot
 * tell (none, or one without its text): its text, author, date and media addresses as JSON, the media
 * then served by `/api/image?xpost=<id>&src=` (only an image this post carries). The post is read from
 * X's syndication host with nothing of the viewer's request (`XPostApplication`); the answer is the app's
 * own JSON, never X's answer passed on. A post is cached a day, X having none five minutes, an ID that
 * is not one a day; X failing (502) or the route busy (503) is never cached.
 */
const POST_CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400';
const MISS_CACHE = 'public, max-age=300, s-maxage=300';
const REFUSED_CACHE = 'public, max-age=86400, s-maxage=86400';
const FAILED_CACHE = 'no-store';

type TFailureStatus = Extract<TXPostControllerResult, { ok: false }>['statusCode'];
const FAILURE_CACHE: Record<TFailureStatus, string> = {
  [HttpStatusCode.BAD_REQUEST]: REFUSED_CACHE,
  [HttpStatusCode.NOT_FOUND]: MISS_CACHE,
  [HttpStatusCode.BAD_GATEWAY]: FAILED_CACHE,
  [HttpStatusCode.SERVICE_UNAVAILABLE]: FAILED_CACHE,
};

/** Same-origin use only, never sniffed as another type. */
const POST_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' };

export async function GET(request: NextRequest) {
  try {
    const result = await XPostController.fetch({ id: request.nextUrl.searchParams.get('id') });
    if (!result.ok) {
      return new NextResponse(null, {
        status: result.statusCode,
        headers: { ...POST_HEADERS, 'Cache-Control': FAILURE_CACHE[result.statusCode] },
      });
    }
    return NextResponse.json(result.post, { headers: { ...POST_HEADERS, 'Cache-Control': POST_CACHE } });
  } catch {
    // Every expected failure is answered above; anything else is an empty 500, never an error text.
    return new NextResponse(null, {
      status: HttpStatusCode.INTERNAL_SERVER_ERROR,
      headers: { ...POST_HEADERS, 'Cache-Control': FAILED_CACHE },
    });
  }
}
