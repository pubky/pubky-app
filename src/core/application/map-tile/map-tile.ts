import { getTileJsonRequest, getTileset, type TMapTileRequest } from '@/pipes/map-tile/map-tile';
import { MAP_TILE_FAILED, NextJsMapTileService } from '@/services/nextjs/map-tile/map-tile';
import { BOUNDED_READ_BUSY, BoundedReadCache } from '@/utils/bounded-cache';
import { KeyedSlots } from '@/utils/keyed-slots';
import { TokenBucket } from '@/utils/token-bucket';

/** The answer while the route's budget or reads are spent: nothing read now, nothing remembered. */
export const MAP_TILE_BUSY = 'busy';
/** The answer when the host could not be read for now: nothing remembered. */
export const MAP_TILE_UNAVAILABLE = 'unavailable';

/** One map file, `null` when there is none to serve, `MAP_TILE_BUSY` or `MAP_TILE_UNAVAILABLE`. */
export type TMapTileRead = Uint8Array | null | typeof MAP_TILE_BUSY | typeof MAP_TILE_UNAVAILABLE;

/** Files kept in memory at most. */
export const MAP_TILE_ENTRIES = 2048;
/** Bytes of files kept in memory at most, all together (each at most `MAP_TILE_MAX_BYTES`). */
export const MAP_TILE_CACHE_BYTES = 64 * 1024 * 1024;
/**
 * Reads of the host running at once at most. A cold map asks for about 12-16 files at once (style,
 * TileJSON, two sprite files, two or three font ranges, 4-8 tiles: a card's map at 1440x900 or 390x844, a
 * page's larger one), two maps on a page about 20-30 with the style, sprites and fonts shared. A read past
 * this waits for a turn up to `MAP_TILE_WAIT_MS` instead of failing: a map draws no tile again that once
 * failed.
 */
export const MAP_TILE_MAX_IN_FLIGHT = 24;
/** How long a read waits for its turn before the route answers busy. */
export const MAP_TILE_WAIT_MS = 4_000;
/** Different files waiting or being read at once at most (a waiting one holds no body). */
export const MAP_TILE_MAX_PENDING = 256;
/**
 * This server instance's budget of reads of the host, all viewers together: 300 at once (about ten
 * maps drawn), twenty a second after that. Past it a file not kept answers busy.
 */
export const MAP_TILE_BURST = 300;
export const MAP_TILE_PER_SECOND = 20;
/** How long the host is not asked after it failed (it may be limiting the server). */
export const MAP_TILE_PAUSE_MS = 10 * 1000;
/** How long a file whose address names its version is kept; a style is kept an hour. */
const IMMUTABLE_TTL_MS = 24 * 60 * 60 * 1000;
const MUTABLE_TTL_MS = 60 * 60 * 1000;
/**
 * How long a copy's TileJSON is kept: the route tells browsers and the CDN to keep it as long
 * (`/api/map`'s TileJSON cache), so a new tile set is seen everywhere within it.
 */
export const MAP_TILEJSON_TTL_MS = 10 * 60 * 1000;
/**
 * How long a tile set the TileJSON named stays served after it named another: browsers, the CDN and other
 * instances may still hold the older TileJSON, and a map never asks again for a tile that failed.
 */
export const MAP_TILESET_KEPT_MS = 2 * 24 * 60 * 60 * 1000;
/** How often at most a copy's TileJSON is read past the cache for a tile set newer than every one seen. */
export const MAP_TILEJSON_REREAD_MS = 60 * 1000;
/** Tile sets remembered at most, both copies together (OpenFreeMap publishes about one a week). */
const MAP_TILESETS_KEPT = 8;
/** How long a file the host has none of is remembered. */
const MISS_TTL_MS = 60 * 1000;

type TNotNow = typeof MAP_TILE_BUSY | typeof MAP_TILE_UNAVAILABLE;
const isNotNow = (value: unknown): value is TNotNow => value === MAP_TILE_BUSY || value === MAP_TILE_UNAVAILABLE;
type TKept = { bytes: Uint8Array; immutable: boolean; tileJson?: boolean };
/** The one key of the host's turns. */
const MAP_TILE_TURN_KEY = 'tiles.openfreemap.org';

/**
 * Map tile application service: one OpenFreeMap file (style, TileJSON, tile, font range, sprite) for the
 * `/api/map` route, so a map is drawn with no request from the viewer's browser to the tile host. Only
 * the addresses `toMapTileRequest` allows are read (`NextJsMapTileService`, one fixed host).
 *
 * A vector tile is served only from a tile set either copy's TileJSON (`planet`, `backup_planet`) named in
 * the last two days. Files are kept a day (a style an hour, a TileJSON ten minutes, a missing file a
 * minute) in a cache bounded by entries and bytes (`BoundedReadCache`); concurrent requests for one file
 * share one read, at most `MAP_TILE_MAX_IN_FLIGHT` run at once, others waiting their turn up to
 * `MAP_TILE_WAIT_MS`, and reads come from this instance's budget (`MAP_TILE_BURST`).
 * After the host fails, it is not asked for `MAP_TILE_PAUSE_MS`; a read not made now answers with the
 * file kept before, expired or not, else busy or unavailable, never remembered.
 */
export class MapTileApplication {
  private constructor() {}

  private static readonly budget = new TokenBucket(MAP_TILE_BURST, MAP_TILE_PER_SECOND);
  /** The turns of reads of the host (one key: the host). */
  private static readonly turns = new KeyedSlots(MAP_TILE_MAX_IN_FLIGHT);
  /** Until when (epoch ms) the host is not asked: a read failed. */
  private static pausedUntil = 0;
  private static readonly files = new BoundedReadCache<TKept | TNotNow>({
    maxEntries: MAP_TILE_ENTRIES,
    maxBytes: MAP_TILE_CACHE_BYTES,
    maxInFlight: MAP_TILE_MAX_PENDING,
    hitTtlMs: IMMUTABLE_TTL_MS,
    missTtlMs: MISS_TTL_MS,
    sizeOf: (file) => (isNotNow(file) ? 0 : file.bytes.byteLength),
    ttlOf: (file) =>
      file && !isNotNow(file) && !file.immutable ? (file.tileJson ? MAP_TILEJSON_TTL_MS : MUTABLE_TTL_MS) : undefined,
    keeps: (file) => !isNotNow(file),
  });

  /**
   * The map file `request` names (validated by `toMapTileRequest`). A vector tile is served only from a
   * tile set a TileJSON (its copy's, read through the same cache) named within `MAP_TILESET_KEPT_MS`, the
   * current one or one before it that browsers or the CDN may still ask for: any other set's address is
   * `null` with no tile read, so made-up addresses cannot each cost a read.
   */
  static async fetchFile(request: TMapTileRequest): Promise<TMapTileRead> {
    if (request.tileset && !MapTileApplication.isRecentTileset(request.tileset)) {
      const tileJsonRequest = getTileJsonRequest(request.tileset);
      if (!tileJsonRequest) return null;
      // A set not named lately: its copy's TileJSON (read through the same cache) may name it now.
      const tileJson = await MapTileApplication.readCached(tileJsonRequest);
      if (isNotNow(tileJson)) return tileJson;
      if (!MapTileApplication.isRecentTileset(request.tileset)) {
        // Newer than every set seen: OpenFreeMap may have published it since the TileJSON was kept (another
        // instance, or a browser, read it first). Read it past the cache, at most once a minute per copy.
        if (
          !MapTileApplication.isNewerTileset(request.tileset) ||
          !MapTileApplication.mayReadTileJsonAgain(tileJsonRequest.path)
        ) {
          return null;
        }
        const fresh = await MapTileApplication.readCached(tileJsonRequest, { maxAgeMs: -1 });
        if (isNotNow(fresh)) return fresh;
        if (!MapTileApplication.isRecentTileset(request.tileset)) return null;
      }
    }
    return MapTileApplication.readCached(request);
  }

  /** When each copy's TileJSON was last read past the cache for a newer tile set (epoch ms). */
  private static readonly tileJsonReadAgainAt = new Map<string, number>();

  /**
   * Whether the TileJSON of `copy` may be read past the cache now (`MAP_TILEJSON_REREAD_MS` since its last
   * time); notes it.
   */
  private static mayReadTileJsonAgain(copy: string): boolean {
    const last = MapTileApplication.tileJsonReadAgainAt.get(copy);
    if (last !== undefined && Date.now() - last < MAP_TILEJSON_REREAD_MS) return false;
    MapTileApplication.tileJsonReadAgainAt.set(copy, Date.now());
    return true;
  }

  /**
   * Whether `tileset` is newer than every set seen in its copy (sets are named by their date; the other
   * copy's sets do not count).
   */
  private static isNewerTileset(tileset: string): boolean {
    const copy = `${tileset.split('/')[0]}/`;
    return [...MapTileApplication.tilesets.keys()].every((known) => !known.startsWith(copy) || tileset > known);
  }

  /** One file through the cache (`maxAgeMs`: read again when kept longer than that; `-1` always). */
  private static async readCached(
    request: TMapTileRequest,
    { maxAgeMs }: { maxAgeMs?: number } = {},
  ): Promise<TMapTileRead> {
    const known = MapTileApplication.files.stale(request.path);
    const file = await MapTileApplication.files.read(
      request.path,
      async () => {
        const release = await MapTileApplication.turns.acquire(MAP_TILE_TURN_KEY, MAP_TILE_WAIT_MS);
        if (!release) return MAP_TILE_BUSY;
        try {
          return await MapTileApplication.readHost(request);
        } finally {
          release();
        }
      },
      { maxAgeMs },
    );
    if (file !== BOUNDED_READ_BUSY && !isNotNow(file)) return file?.bytes ?? null;
    // Not read now: the file kept before, expired or not, answers.
    if (known && !isNotNow(known)) return known.bytes;
    return file === BOUNDED_READ_BUSY ? MAP_TILE_BUSY : file;
  }

  /** One read of the host from the budget, pausing it when it failed. */
  private static async readHost(request: TMapTileRequest): Promise<TKept | null | TNotNow> {
    if (Date.now() < MapTileApplication.pausedUntil || !MapTileApplication.budget.take()) return MAP_TILE_BUSY;
    const bytes = await NextJsMapTileService.fetch(request);
    if (bytes === MAP_TILE_FAILED) {
      MapTileApplication.pausedUntil = Date.now() + MAP_TILE_PAUSE_MS;
      return MAP_TILE_UNAVAILABLE;
    }
    if (bytes && request.tileJson) MapTileApplication.noteTileset(bytes);
    return bytes ? { bytes, immutable: request.immutable, tileJson: request.tileJson } : null;
  }

  /** The tile sets (`<copy>/<date>_pt`) the TileJSONs named, and when they last did (epoch ms). */
  private static readonly tilesets = new Map<string, number>();

  /** Notes the tile set a TileJSON just read names, the oldest forgotten past `MAP_TILESETS_KEPT`. */
  private static noteTileset(tileJson: Uint8Array): void {
    const tileset = getTileset(tileJson);
    if (!tileset) return;
    MapTileApplication.tilesets.delete(tileset);
    MapTileApplication.tilesets.set(tileset, Date.now());
    while (MapTileApplication.tilesets.size > MAP_TILESETS_KEPT) {
      const oldest = MapTileApplication.tilesets.keys().next().value;
      if (oldest === undefined) break;
      MapTileApplication.tilesets.delete(oldest);
    }
  }

  /** Whether a TileJSON named `tileset` within `MAP_TILESET_KEPT_MS`. */
  private static isRecentTileset(tileset: string): boolean {
    const seen = MapTileApplication.tilesets.get(tileset);
    return seen !== undefined && Date.now() - seen <= MAP_TILESET_KEPT_MS;
  }

  /** Empties the cache, fills the budget and ends any pause (tests). */
  static clearCache(): void {
    MapTileApplication.files.clear();
    MapTileApplication.turns.clear();
    MapTileApplication.tilesets.clear();
    MapTileApplication.tileJsonReadAgainAt.clear();
    MapTileApplication.budget.reset();
    MapTileApplication.pausedUntil = 0;
  }
}
