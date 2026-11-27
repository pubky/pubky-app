import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toMapTileRequest } from '@/pipes/map-tile/map-tile';
import { NextJsMapTileService } from '@/services/nextjs/map-tile/map-tile';
import {
  MAP_TILE_BURST,
  MAP_TILE_BUSY,
  MAP_TILE_MAX_IN_FLIGHT,
  MAP_TILE_PAUSE_MS,
  MAP_TILE_UNAVAILABLE,
  MAP_TILE_WAIT_MS,
  MAP_TILEJSON_REREAD_MS,
  MAP_TILEJSON_TTL_MS,
  MAP_TILESET_KEPT_MS,
  MapTileApplication,
} from './map-tile';

vi.mock('@/services/nextjs/map-tile/map-tile', () => ({
  MAP_TILE_FAILED: 'failed',
  NextJsMapTileService: { fetch: vi.fn() },
}));

const BYTES = new Uint8Array([1, 2, 3]);
const TILESET = '20261115_080022_pt';
const TILE_JSON = new TextEncoder().encode(
  JSON.stringify({ tiles: [`https://tiles.openfreemap.org/planet/${TILESET}/{z}/{x}/{y}.pbf`] }),
);
const tile = (y = 358, tileset = TILESET) => toMapTileRequest(`planet/${tileset}/10/536/${y}.pbf`)!;
/** The host's answers: the TileJSON for `planet`, else `answer` (or the next of `answers`). */
const host = (...answers: (Uint8Array | null | 'failed')[]) => {
  let index = 0;
  vi.mocked(NextJsMapTileService.fetch).mockImplementation(async (request) =>
    request.path === 'planet' ? TILE_JSON : answers[Math.min(index++, answers.length - 1)],
  );
};
const tileReads = () =>
  vi.mocked(NextJsMapTileService.fetch).mock.calls.filter(([request]) => request.path !== 'planet');

describe('MapTileApplication', () => {
  beforeEach(() => {
    MapTileApplication.clearCache();
    vi.mocked(NextJsMapTileService.fetch).mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('reads a file once, sharing one read and keeping it', async () => {
    host(BYTES);

    const answers = await Promise.all([MapTileApplication.fetchFile(tile()), MapTileApplication.fetchFile(tile())]);
    await MapTileApplication.fetchFile(tile());

    expect(answers).toEqual([BYTES, BYTES]);
    expect(tileReads()).toHaveLength(1);
  });

  it('answers unavailable when the host fails, asking it nothing for a while, then reads again', async () => {
    vi.useFakeTimers();
    host('failed', BYTES);

    await expect(MapTileApplication.fetchFile(tile())).resolves.toBe(MAP_TILE_UNAVAILABLE);
    await expect(MapTileApplication.fetchFile(tile(1))).resolves.toBe(MAP_TILE_BUSY);
    vi.advanceTimersByTime(MAP_TILE_PAUSE_MS);
    await expect(MapTileApplication.fetchFile(tile())).resolves.toBe(BYTES);
  });

  it('answers busy past its budget, without asking the host', async () => {
    host(BYTES);
    // The TileJSON's own read takes one.
    for (let y = 0; y < MAP_TILE_BURST - 1; y++) await MapTileApplication.fetchFile(tile(y));

    await expect(MapTileApplication.fetchFile(tile(1000))).resolves.toBe(MAP_TILE_BUSY);
    expect(NextJsMapTileService.fetch).toHaveBeenCalledTimes(MAP_TILE_BURST);
  });

  it('draws a cold map of 30 files at once: reads past the cap wait their turn, none answers busy', async () => {
    let running = 0;
    let most = 0;
    vi.mocked(NextJsMapTileService.fetch).mockImplementation(async (request) => {
      if (request.path === 'planet') return TILE_JSON;
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return BYTES;
    });

    const answers = await Promise.all(Array.from({ length: 30 }, (_, y) => MapTileApplication.fetchFile(tile(y))));

    expect(answers.every((answer) => answer === BYTES)).toBe(true);
    expect(most).toBeLessThanOrEqual(MAP_TILE_MAX_IN_FLIGHT);
  });

  it('answers busy for a read whose turn does not come in time', async () => {
    vi.useFakeTimers();
    vi.mocked(NextJsMapTileService.fetch).mockImplementation(async (request) =>
      request.path === 'planet' ? TILE_JSON : new Promise(() => {}),
    );
    await MapTileApplication.fetchFile(toMapTileRequest('planet')!);
    for (let y = 0; y < MAP_TILE_MAX_IN_FLIGHT; y++) void MapTileApplication.fetchFile(tile(y));
    const late = MapTileApplication.fetchFile(tile(999));

    await vi.advanceTimersByTimeAsync(MAP_TILE_WAIT_MS);
    await expect(late).resolves.toBe(MAP_TILE_BUSY);
  });

  it('remembers a file the host has none of', async () => {
    host(null);

    await expect(MapTileApplication.fetchFile(tile())).resolves.toBeNull();
    await expect(MapTileApplication.fetchFile(tile())).resolves.toBeNull();
    expect(tileReads()).toHaveLength(1);
  });

  it('keeps serving the set the TileJSON named before once it names a new one, for two days, reading the new one too', async () => {
    vi.useFakeTimers();
    const NEW_SET = '20261122_080022_pt';
    const tileJsonOf = (set: string) =>
      new TextEncoder().encode(
        JSON.stringify({ tiles: [`https://tiles.openfreemap.org/planet/${set}/{z}/{x}/{y}.pbf`] }),
      );
    let current = TILESET;
    vi.mocked(NextJsMapTileService.fetch).mockImplementation(async (request) =>
      request.path === 'planet' ? tileJsonOf(current) : BYTES,
    );
    await expect(MapTileApplication.fetchFile(tile(1))).resolves.toBe(BYTES);

    // OpenFreeMap publishes a new set; the server's TileJSON is read again once it expires.
    current = NEW_SET;
    vi.advanceTimersByTime(MAP_TILEJSON_TTL_MS + 1);
    await expect(MapTileApplication.fetchFile(tile(2, NEW_SET))).resolves.toBe(BYTES);
    // A browser or the CDN still holding the older TileJSON asks old-set tiles: still served.
    await expect(MapTileApplication.fetchFile(tile(3))).resolves.toBe(BYTES);

    vi.advanceTimersByTime(MAP_TILESET_KEPT_MS + 1);
    await expect(MapTileApplication.fetchFile(tile(4))).resolves.toBeNull();
    await expect(MapTileApplication.fetchFile(tile(5, NEW_SET))).resolves.toBe(BYTES);
  });

  it('reads the TileJSON again past the cache for a set newer than every one seen, at most once a minute', async () => {
    vi.useFakeTimers();
    const NEWER = '20261129_080022_pt';
    const tileJsonOf = (set: string) =>
      new TextEncoder().encode(
        JSON.stringify({ tiles: [`https://tiles.openfreemap.org/planet/${set}/{z}/{x}/{y}.pbf`] }),
      );
    let current = TILESET;
    vi.mocked(NextJsMapTileService.fetch).mockImplementation(async (request) =>
      request.path === 'planet' ? tileJsonOf(current) : BYTES,
    );
    const tileJsonReads = () =>
      vi.mocked(NextJsMapTileService.fetch).mock.calls.filter(([request]) => request.path === 'planet').length;
    await MapTileApplication.fetchFile(tile(1));
    expect(tileJsonReads()).toBe(1);

    // Another instance or a browser saw the new set first: the kept TileJSON does not name it yet.
    current = NEWER;
    await expect(MapTileApplication.fetchFile(tile(2, NEWER))).resolves.toBe(BYTES);
    expect(tileJsonReads()).toBe(2);

    // Within the minute: no other read past the cache. Past it, a made-up newer set costs one, then none.
    await expect(MapTileApplication.fetchFile(tile(7, '20991231_000009_pt'))).resolves.toBeNull();
    expect(tileJsonReads()).toBe(2);
    vi.advanceTimersByTime(MAP_TILEJSON_REREAD_MS);
    await expect(MapTileApplication.fetchFile(tile(3, '20991231_000000_pt'))).resolves.toBeNull();
    await expect(MapTileApplication.fetchFile(tile(4, '20991231_000001_pt'))).resolves.toBeNull();
    expect(tileJsonReads()).toBe(3);
    vi.advanceTimersByTime(MAP_TILEJSON_REREAD_MS);
    await expect(MapTileApplication.fetchFile(tile(5, '20991231_000002_pt'))).resolves.toBeNull();
    expect(tileJsonReads()).toBe(4);

    // An older unknown set is refused with no read at all.
    await expect(MapTileApplication.fetchFile(tile(6, '20200101_000000_pt'))).resolves.toBeNull();
    expect(tileJsonReads()).toBe(4);
  });

  describe('the backup copy (`backup_planet`)', () => {
    const BACKUP_SET = '20261122_124456_pt';
    const tileJsonOf = (copy: string, set: string) =>
      new TextEncoder().encode(
        JSON.stringify({ tiles: [`https://tiles.openfreemap.org/${copy}/${set}/{z}/{x}/{y}.pbf`] }),
      );
    const tileIn = (copy: string, set: string, y = 358) => toMapTileRequest(`${copy}/${set}/10/536/${y}.pbf`)!;
    const reads = (path: string) =>
      vi.mocked(NextJsMapTileService.fetch).mock.calls.filter(([request]) => request.path === path).length;

    it('serves each copy’s tiles once that copy’s TileJSON names them', async () => {
      vi.mocked(NextJsMapTileService.fetch).mockImplementation(async (request) =>
        request.path === 'planet'
          ? tileJsonOf('planet', TILESET)
          : request.path === 'backup_planet'
            ? tileJsonOf('backup_planet', BACKUP_SET)
            : BYTES,
      );

      await expect(MapTileApplication.fetchFile(tileIn('backup_planet', BACKUP_SET))).resolves.toBe(BYTES);
      await expect(MapTileApplication.fetchFile(tileIn('planet', TILESET))).resolves.toBe(BYTES);
      expect(reads('backup_planet')).toBe(1);
      expect(reads('planet')).toBe(1);
    });

    it('serves no tile of a set in one copy that a TileJSON named in the other copy, even of the same date', async () => {
      vi.mocked(NextJsMapTileService.fetch).mockImplementation(async (request) =>
        request.path === 'planet' ? tileJsonOf('planet', BACKUP_SET) : request.path === 'backup_planet' ? null : BYTES,
      );
      await expect(MapTileApplication.fetchFile(tileIn('planet', BACKUP_SET))).resolves.toBe(BYTES);

      await expect(MapTileApplication.fetchFile(tileIn('backup_planet', BACKUP_SET))).resolves.toBeNull();
      expect(
        vi
          .mocked(NextJsMapTileService.fetch)
          .mock.calls.filter(([request]) => request.path.startsWith('backup_planet/')),
      ).toHaveLength(0);
    });

    it('serves a set of the backup copy that the planet’s TileJSON names, and only in that copy', async () => {
      vi.mocked(NextJsMapTileService.fetch).mockImplementation(async (request) =>
        request.path === 'planet'
          ? tileJsonOf('backup_planet', BACKUP_SET)
          : request.path === 'backup_planet'
            ? null
            : BYTES,
      );
      await expect(MapTileApplication.fetchFile(toMapTileRequest('planet')!)).resolves.not.toBeNull();

      await expect(MapTileApplication.fetchFile(tileIn('backup_planet', BACKUP_SET))).resolves.toBe(BYTES);
      await expect(MapTileApplication.fetchFile(tileIn('planet', BACKUP_SET))).resolves.toBeNull();
    });

    it('reads each copy’s TileJSON past the cache at most once a minute, the other copy’s read not counting', async () => {
      vi.useFakeTimers();
      let planet = TILESET;
      let backup = '20261108_000000_pt';
      vi.mocked(NextJsMapTileService.fetch).mockImplementation(async (request) =>
        request.path === 'planet'
          ? tileJsonOf('planet', planet)
          : request.path === 'backup_planet'
            ? tileJsonOf('backup_planet', backup)
            : BYTES,
      );
      await MapTileApplication.fetchFile(tileIn('planet', planet));
      await MapTileApplication.fetchFile(tileIn('backup_planet', backup));

      // Both copies publish a new set within one minute: each copy's TileJSON is read again once.
      planet = '20261129_080022_pt';
      backup = BACKUP_SET;
      await expect(MapTileApplication.fetchFile(tileIn('planet', planet))).resolves.toBe(BYTES);
      await expect(MapTileApplication.fetchFile(tileIn('backup_planet', backup))).resolves.toBe(BYTES);
      expect(reads('planet')).toBe(2);
      expect(reads('backup_planet')).toBe(2);

      // Within that minute a made-up newer set costs no further read in either copy.
      await expect(MapTileApplication.fetchFile(tileIn('backup_planet', '20991231_000000_pt'))).resolves.toBeNull();
      expect(reads('backup_planet')).toBe(2);
    });

    it('reads its TileJSON again for a set newer than every one it named, whatever the other copy named', async () => {
      vi.useFakeTimers();
      let backup = '20261108_000000_pt';
      vi.mocked(NextJsMapTileService.fetch).mockImplementation(async (request) =>
        request.path === 'planet'
          ? tileJsonOf('planet', '20261129_080022_pt')
          : request.path === 'backup_planet'
            ? tileJsonOf('backup_planet', backup)
            : BYTES,
      );
      await MapTileApplication.fetchFile(tileIn('planet', '20261129_080022_pt'));
      await MapTileApplication.fetchFile(tileIn('backup_planet', backup));
      expect(reads('backup_planet')).toBe(1);

      // The backup copy moves to a set older than planet's newest: still newer than every backup set seen.
      backup = BACKUP_SET;
      await expect(MapTileApplication.fetchFile(tileIn('backup_planet', BACKUP_SET))).resolves.toBe(BYTES);
      expect(reads('backup_planet')).toBe(2);
    });
  });

  it('serves no tile of a set the TileJSON does not name now, reading none', async () => {
    host(BYTES);

    await expect(MapTileApplication.fetchFile(tile(358, '12345678_123456_pt'))).resolves.toBeNull();
    await expect(MapTileApplication.fetchFile(tile(358, '00000000_000000_pt'))).resolves.toBeNull();
    expect(tileReads()).toHaveLength(0);
  });
});
