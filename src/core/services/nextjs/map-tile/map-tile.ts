import { MAP_TILE_HOST, type TMapTileRequest } from '@/pipes/map-tile/map-tile';
import { APP_USER_AGENT } from '../nextjs.utils';

/**
 * The largest map file served. Measured on 2026-11-23: a dense city's vector tile at zoom 10 is about
 * 230 KB, a sprite sheet 130 KB, a font range 77 KB, a style 25 KB; the planet's TileJSON is larger
 * (its layer list), about 40 KB. 2 MB serves every one with room.
 */
export const MAP_TILE_MAX_BYTES = 2 * 1024 * 1024;
/** The whole read of one file, the body included. */
export const MAP_TILE_TIMEOUT_MS = 8_000;
/**
 * A read that may pass later: no answer in time (the body included), a failed connection, a redirect, a
 * 429 or a server error.
 */
export const MAP_TILE_FAILED = 'failed';

/** The PNG signature, which every PNG file starts with. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The app names itself; no cookie, credential, referrer or header of the viewer's request. */
const FETCH_HEADERS = { 'User-Agent': APP_USER_AGENT, Accept: '*/*' };

/**
 * Next.js map tile service: reads one OpenFreeMap file for the `/api/map` route, at the address made of
 * `MAP_TILE_HOST` and a path the route allows (`toMapTileRequest`), never another host, naming the app
 * (`APP_USER_AGENT`). No redirect is
 * followed, `MAP_TILE_TIMEOUT_MS` for everything, `MAP_TILE_MAX_BYTES` read at most, and a PNG file only
 * served when its bytes are one.
 */
export class NextJsMapTileService {
  private constructor() {}

  /**
   * The file's bytes; `null` when there is none to serve (a client error, too large, not a PNG where one
   * is due), `MAP_TILE_FAILED` when the read may pass later. Never throws.
   */
  static async fetch(request: TMapTileRequest): Promise<Uint8Array | null | typeof MAP_TILE_FAILED> {
    let response: Response;
    try {
      response = await fetch(`https://${MAP_TILE_HOST}/${request.path}`, {
        headers: FETCH_HEADERS,
        redirect: 'manual',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        signal: AbortSignal.timeout(MAP_TILE_TIMEOUT_MS),
      });
    } catch {
      return MAP_TILE_FAILED;
    }
    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      // A redirect, a 429 or a server error may pass later; any other client error says there is none.
      const failed =
        response.status === 429 || response.status >= 500 || (response.status >= 300 && response.status < 400);
      return failed || response.status === 0 ? MAP_TILE_FAILED : null;
    }
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAP_TILE_MAX_BYTES) {
      response.body?.cancel().catch(() => {});
      return null;
    }
    const bytes = await readCapped(response);
    if (bytes === MAP_TILE_FAILED || !bytes) return bytes;
    if (request.png && !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return null;
    return bytes;
  }
}

/**
 * The body's bytes, at most `MAP_TILE_MAX_BYTES` (`null` past that: there is none to serve), or
 * `MAP_TILE_FAILED` when the read broke off (a timeout, a dropped connection), which may pass later.
 */
async function readCapped(response: Response): Promise<Uint8Array | null | typeof MAP_TILE_FAILED> {
  const reader = response.body?.getReader();
  if (!reader) return MAP_TILE_FAILED;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAP_TILE_MAX_BYTES) {
        reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } catch {
    reader.cancel().catch(() => {});
    return MAP_TILE_FAILED;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
