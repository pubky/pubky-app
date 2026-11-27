import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toMapTileRequest } from '@/pipes/map-tile/map-tile';
import { MAP_TILE_FAILED, MAP_TILE_MAX_BYTES, NextJsMapTileService } from './map-tile';

const fetchMock = vi.fn();
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const tile = toMapTileRequest('planet/20261115_080022_pt/10/536/358.pbf')!;
const relief = toMapTileRequest('natural_earth/ne2sr/2/1/1.png')!;

describe('NextJsMapTileService.fetch', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads the one host at the allowed path, with nothing of the viewer’s and no redirect', async () => {
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));

    await expect(NextJsMapTileService.fetch(tile)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://tiles.openfreemap.org/planet/20261115_080022_pt/10/536/358.pbf');
    expect(init).toMatchObject({ redirect: 'manual', credentials: 'omit', referrerPolicy: 'no-referrer' });
    expect(Object.keys(init.headers)).toEqual(['User-Agent', 'Accept']);
    expect(init.headers['User-Agent']).toMatch(/^PubkyApp\/.+ \(\+https:\/\/pubky\.app\)$/);
  });

  it('serves a PNG file only when its bytes are one', async () => {
    fetchMock.mockResolvedValueOnce(new Response(PNG)).mockResolvedValueOnce(new Response('<html>'));

    await expect(NextJsMapTileService.fetch(relief)).resolves.toEqual(PNG);
    await expect(NextJsMapTileService.fetch(relief)).resolves.toBeNull();
  });

  it('refuses a file larger than the cap, declared or read', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('x', { headers: { 'content-length': String(MAP_TILE_MAX_BYTES + 1) } }))
      .mockResolvedValueOnce(new Response(new Uint8Array(MAP_TILE_MAX_BYTES + 1)));

    await expect(NextJsMapTileService.fetch(tile)).resolves.toBeNull();
    await expect(NextJsMapTileService.fetch(tile)).resolves.toBeNull();
  });

  it.each([
    [404, null],
    [403, null],
    [301, MAP_TILE_FAILED],
    [429, MAP_TILE_FAILED],
    [503, MAP_TILE_FAILED],
  ])('answers a %i as %s', async (status, answer) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status }));

    await expect(NextJsMapTileService.fetch(tile)).resolves.toBe(answer);
  });

  it('answers failed when the body breaks off (a timeout, a dropped connection), so nothing is kept as missing', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.error(new Error('aborted'));
      },
    });
    fetchMock.mockResolvedValueOnce(new Response(body));

    await expect(NextJsMapTileService.fetch(tile)).resolves.toBe(MAP_TILE_FAILED);
  });

  it('answers failed when the host does not answer', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));

    await expect(NextJsMapTileService.fetch(tile)).resolves.toBe(MAP_TILE_FAILED);
  });
});
