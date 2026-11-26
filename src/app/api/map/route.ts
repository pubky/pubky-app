import { NextRequest, NextResponse } from 'next/server';
import { MapTileController, type TMapTileControllerResult } from '@/controllers/map-tile/map-tile';
import { HttpStatusCode } from '@/libs/http/http.types';

/**
 * A map's files served from the app's origin (`?p=<path on tiles.openfreemap.org>`): the style, the
 * TileJSON, the vector and relief tiles, the fonts and the sprites a map of the app asks for, each by an
 * allowed address pattern (`toMapTileRequest`), read from that one host only (`MapTileApplication`), so
 * the viewer's browser draws a map with no request to the tile host (`toPrivateMapRequest` sends every
 * map request here). Not a proxy: any other path is a 400 with nothing read. Each file is served as the
 * type its pattern says, never as script or a document, and same-origin only. A file whose address names
 * its version is cached a year (immutable), a style an hour, the TileJSON ten minutes (as the server keeps
 * it, so a new tile set is seen soon); a missing file a minute; the host
 * failing (502) or the route busy (503) is never cached.
 */
const IMMUTABLE_CACHE = 'public, max-age=31536000, s-maxage=31536000, immutable';
const MUTABLE_CACHE = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400';
/**
 * A copy's TileJSON (`planet`, `backup_planet`): as long as the server keeps it (`MAP_TILEJSON_TTL_MS`),
 * no stale copy.
 */
const TILEJSON_CACHE = 'public, max-age=600, s-maxage=600';
const MISS_CACHE = 'public, max-age=60, s-maxage=60';
const REFUSED_CACHE = 'public, max-age=86400, s-maxage=86400';
const FAILED_CACHE = 'no-store';

type TFailureStatus = Extract<TMapTileControllerResult, { ok: false }>['statusCode'];
const FAILURE_CACHE: Record<TFailureStatus, string> = {
  [HttpStatusCode.BAD_REQUEST]: REFUSED_CACHE,
  [HttpStatusCode.NOT_FOUND]: MISS_CACHE,
  [HttpStatusCode.BAD_GATEWAY]: FAILED_CACHE,
  [HttpStatusCode.SERVICE_UNAVAILABLE]: FAILED_CACHE,
};

/** Never sniffed as another type, no script or document, same-origin use only. */
const FILE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export async function GET(request: NextRequest) {
  try {
    const result = await MapTileController.fetch({ path: request.nextUrl.searchParams.get('p') });
    if (!result.ok) {
      return new NextResponse(null, {
        status: result.statusCode,
        headers: { ...FILE_HEADERS, 'Cache-Control': FAILURE_CACHE[result.statusCode] },
      });
    }
    const { body, contentType, immutable, tileJson } = result.file;
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        ...FILE_HEADERS,
        'Content-Type': contentType,
        'Content-Length': String(body.byteLength),
        'Cache-Control': immutable ? IMMUTABLE_CACHE : tileJson ? TILEJSON_CACHE : MUTABLE_CACHE,
      },
    });
  } catch {
    // Every expected failure is answered above; anything else is an empty 500, never an error text.
    return new NextResponse(null, {
      status: HttpStatusCode.INTERNAL_SERVER_ERROR,
      headers: { ...FILE_HEADERS, 'Cache-Control': FAILED_CACHE },
    });
  }
}
