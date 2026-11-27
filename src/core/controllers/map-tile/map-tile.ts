import { MAP_TILE_BUSY, MAP_TILE_UNAVAILABLE, MapTileApplication } from '@/application/map-tile/map-tile';
import { HttpStatusCode } from '@/libs/http/http.types';
import { type TMapTileRequest, toMapTileRequest } from '@/pipes/map-tile/map-tile';

export type TMapTileControllerResult =
  | { ok: true; file: { body: Uint8Array; contentType: string; immutable: boolean; tileJson: boolean } }
  | {
      ok: false;
      statusCode:
        | HttpStatusCode.BAD_REQUEST
        | HttpStatusCode.NOT_FOUND
        | HttpStatusCode.BAD_GATEWAY
        | HttpStatusCode.SERVICE_UNAVAILABLE;
    };

/**
 * Controller for the map files served from the app's origin (`/api/map`), so a map is drawn with no
 * request from the viewer's browser to the tile host.
 */
export class MapTileController {
  private constructor() {}

  /**
   * One map file by its path on the tile host.
   *
   * @param params.path - Raw `p` (may be null): the path, as a map's request names it
   * @returns The file with the type it is served as; 400 for a path the route never reads; 404 when the
   *   host has none; 502 when the host failed for now; 503 past the route's budget and caps
   */
  static async fetch({ path }: { path: string | null }): Promise<TMapTileControllerResult> {
    const request: TMapTileRequest | null = toMapTileRequest(path);
    if (!request) return { ok: false, statusCode: HttpStatusCode.BAD_REQUEST };
    const file = await MapTileApplication.fetchFile(request);
    if (file === MAP_TILE_BUSY) return { ok: false, statusCode: HttpStatusCode.SERVICE_UNAVAILABLE };
    if (file === MAP_TILE_UNAVAILABLE) return { ok: false, statusCode: HttpStatusCode.BAD_GATEWAY };
    if (!file) return { ok: false, statusCode: HttpStatusCode.NOT_FOUND };
    return {
      ok: true,
      file: {
        body: file,
        contentType: request.contentType,
        immutable: request.immutable,
        tileJson: request.tileJson ?? false,
      },
    };
  }
}
