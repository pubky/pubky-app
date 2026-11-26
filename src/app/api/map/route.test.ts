import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const { fetchFile } = vi.hoisted(() => ({ fetchFile: vi.fn() }));
vi.mock('@/application/map-tile/map-tile', () => ({
  MAP_TILE_BUSY: 'busy',
  MAP_TILE_UNAVAILABLE: 'unavailable',
  MapTileApplication: { fetchFile },
}));

const request = (path: string | null) =>
  new NextRequest(`https://pubky.app/api/map${path === null ? '' : `?${new URLSearchParams({ p: path })}`}`);

const expectSafeHeaders = (response: Response) => {
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
  expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
};

describe('GET /api/map', () => {
  beforeEach(() => fetchFile.mockReset());

  it('serves a tile as its pattern’s type, cached for good', async () => {
    fetchFile.mockResolvedValueOnce(new Uint8Array([1, 2, 3]));

    const response = await GET(request('planet/20261115_080022_pt/10/536/358.pbf'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/x-protobuf');
    expect(response.headers.get('content-length')).toBe('3');
    expect(response.headers.get('cache-control')).toContain('immutable');
    expectSafeHeaders(response);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it.each(['planet', 'backup_planet'])(
    'serves the %s TileJSON kept as long as the server keeps it, with no stale copy',
    async (path) => {
      fetchFile.mockResolvedValueOnce(new TextEncoder().encode('{}'));

      const response = await GET(request(path));

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/json');
      expect(response.headers.get('cache-control')).toBe('public, max-age=600, s-maxage=600');
    },
  );

  it('serves a tile of the backup copy as a tile, cached for good', async () => {
    fetchFile.mockResolvedValueOnce(new Uint8Array([1, 2, 3]));

    const response = await GET(request('backup_planet/20261122_124456_pt/10/536/358.pbf'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/x-protobuf');
    expect(response.headers.get('cache-control')).toContain('immutable');
  });

  it('serves a style as JSON, kept an hour', async () => {
    fetchFile.mockResolvedValueOnce(new TextEncoder().encode('{}'));

    const response = await GET(request('styles/dark'));

    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('cache-control')).toContain('max-age=3600');
  });

  it.each([null, 'styles/liberty', 'https://evil.example/x', '../etc/passwd', 'other_planet', 'backup_planet/x'])(
    'refuses %j with a 400, reading nothing',
    async (path) => {
      const response = await GET(request(path));

      expect(response.status).toBe(400);
      expect(fetchFile).not.toHaveBeenCalled();
      expectSafeHeaders(response);
    },
  );

  it.each([
    [null, 404, 'public, max-age=60, s-maxage=60'],
    ['unavailable', 502, 'no-store'],
    ['busy', 503, 'no-store'],
  ])('answers %s as %i', async (answer, status, cache) => {
    fetchFile.mockResolvedValueOnce(answer);

    const response = await GET(request('styles/dark'));

    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe(cache);
  });

  it('answers an empty 500 for anything unexpected', async () => {
    fetchFile.mockRejectedValueOnce(new Error('boom'));

    const response = await GET(request('styles/dark'));

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe('');
  });
});
