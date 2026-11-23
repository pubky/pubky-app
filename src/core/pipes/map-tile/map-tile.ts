/**
 * What the app's map route (`/api/map`) serves for its maps: the parts of OpenFreeMap's service a map of
 * the app asks for (its two styles, the planet's TileJSON and vector tiles, the Natural Earth relief,
 * the fonts and the sprites), each by an address pattern on `MAP_TILE_HOST`. Pure: no read here.
 */

/** The one host the route reads from. */
export const MAP_TILE_HOST = 'tiles.openfreemap.org';

/** What one allowed address is, and how it is served. */
export interface TMapTileRequest {
  /** The path on `MAP_TILE_HOST`, as validated (no leading `/`). */
  path: string;
  /** The type the route serves it as, whatever the host says. */
  contentType: string;
  /** The address names one version of the file (a tile set's dated path, a font range, a sprite): never changes. */
  immutable: boolean;
  /** For PNG files: their bytes must be a PNG. */
  png: boolean;
  /** A vector tile's tile set (`<date>_pt`): served only when the planet's TileJSON named it lately. */
  tileset?: string;
  /** The planet's TileJSON: which tile set is current, kept briefly everywhere so a new set is seen soon. */
  tileJson?: boolean;
}

/** The longest path the route reads. */
const MAX_PATH_LENGTH = 200;

const JSON_TYPE = 'application/json';
const PBF_TYPE = 'application/x-protobuf';
const PNG_TYPE = 'image/png';

/** A tile's `z/x/y` is a real tile at a zoom up to `maxZoom`. */
function isTile(z: string, x: string, y: string, maxZoom: number): boolean {
  const zoom = Number(z);
  if (!Number.isInteger(zoom) || zoom < 0 || zoom > maxZoom) return false;
  const size = 2 ** zoom;
  return [x, y].every((value) => Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) < size);
}

/** A tile number as a map writes it: no leading zero, so one tile has one address. */
const N = '(0|[1-9]\\d{0,4})';
/** The fonts the styles name, each one stack or several joined by a comma. */
const FONT = 'Noto%20Sans%20(?:Regular|Bold|Italic)';
const FONT_PATH = new RegExp(`^fonts/${FONT}(?:(?:,|%2C)${FONT}){0,2}/${N}-${N}\\.pbf$`);
const STYLE_PATH = /^styles\/(?:dark|positron)$/;
const TILEJSON_PATH = /^planet$/;
const VECTOR_TILE_PATH = new RegExp(`^planet/(\\d{8}_\\d{6}_pt)/${N}/${N}/${N}\\.pbf$`);
const RASTER_TILE_PATH = new RegExp(`^natural_earth/ne2sr/${N}/${N}/${N}\\.png$`);
const SPRITE_PATH = /^sprites\/ofm_[a-z0-9]{1,16}\/ofm(?:@2x)?\.(json|png)$/;

/**
 * The map file at `path` on `MAP_TILE_HOST` (as a map's request names it, percent-encoding kept), or
 * `null` when it is none the route serves: a style (`styles/dark`, `styles/positron`), the planet's
 * TileJSON (`planet`) and its vector tiles (`planet/<date>_pt/z/x/y.pbf`, zoom 0-14; the application
 * serves only a tile set the TileJSON named lately, `tileset`), Natural Earth relief tiles (zoom 0-6), a
 * font range of the styles' Noto Sans, or a sprite; tile numbers without leading zeros. Nothing else.
 */
export function toMapTileRequest(path: string | null | undefined): TMapTileRequest | null {
  if (typeof path !== 'string' || !path || path.length > MAX_PATH_LENGTH) return null;
  if (TILEJSON_PATH.test(path)) return { path, contentType: JSON_TYPE, immutable: false, png: false, tileJson: true };
  if (STYLE_PATH.test(path)) return { path, contentType: JSON_TYPE, immutable: false, png: false };
  const vector = VECTOR_TILE_PATH.exec(path);
  if (vector)
    return isTile(vector[2], vector[3], vector[4], 14) ? { ...immutable(path, PBF_TYPE), tileset: vector[1] } : null;
  const raster = RASTER_TILE_PATH.exec(path);
  if (raster) return isTile(raster[1], raster[2], raster[3], 6) ? immutable(path, PNG_TYPE) : null;
  const font = FONT_PATH.exec(path);
  if (font) {
    const [start, end] = [Number(font[1]), Number(font[2])];
    return start % 256 === 0 && end === start + 255 && end <= 65535 ? immutable(path, PBF_TYPE) : null;
  }
  const sprite = SPRITE_PATH.exec(path);
  if (sprite) return immutable(path, sprite[1] === 'png' ? PNG_TYPE : JSON_TYPE);
  return null;
}

function immutable(path: string, contentType: string): TMapTileRequest {
  return { path, contentType, immutable: true, png: contentType === PNG_TYPE };
}

/** The tile set the planet's TileJSON names now (`<date>_pt` of its tile address), or `null`. */
export function getTileset(tileJson: Uint8Array): string | null {
  try {
    const tiles: unknown = JSON.parse(new TextDecoder().decode(tileJson))?.tiles;
    const first = Array.isArray(tiles) && typeof tiles[0] === 'string' ? tiles[0] : '';
    return /^https:\/\/tiles\.openfreemap\.org\/planet\/(\d{8}_\d{6}_pt)\//.exec(first)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * The address a map asks for, sent to the app's map route instead (`<origin>/api/map?p=<path>`) when it
 * is on `MAP_TILE_HOST` with no query; any other address goes to the route with no path, which refuses it
 * (400): the viewer's browser is never sent to another host.
 */
export function toMapRouteUrl(url: string, origin: string, route: string): string {
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }
  if (!parsed || parsed.protocol !== 'https:' || parsed.hostname !== MAP_TILE_HOST || parsed.search || parsed.hash) {
    return `${origin}${route}`;
  }
  return `${origin}${route}?${new URLSearchParams({ p: parsed.pathname.replace(/^\//, '') })}`;
}
