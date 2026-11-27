import { describe, expect, it } from 'vitest';
import { getTileJsonRequest, getTileset, toMapRouteUrl, toMapTileRequest } from './map-tile';

describe('toMapTileRequest', () => {
  it.each([
    ['styles/dark', 'application/json', false],
    ['styles/positron', 'application/json', false],
    ['planet', 'application/json', false],
    ['planet/20261115_080022_pt/10/536/358.pbf', 'application/x-protobuf', true],
    ['planet/20261115_080022_pt/0/0/0.pbf', 'application/x-protobuf', true],
    ['backup_planet', 'application/json', false],
    ['backup_planet/20261122_124456_pt/10/536/358.pbf', 'application/x-protobuf', true],
    ['natural_earth/ne2sr/2/1/1.png', 'image/png', true],
    ['fonts/Noto%20Sans%20Regular/0-255.pbf', 'application/x-protobuf', true],
    ['fonts/Noto%20Sans%20Bold,Noto%20Sans%20Italic/65280-65535.pbf', 'application/x-protobuf', true],
    ['sprites/ofm_f384/ofm.json', 'application/json', true],
    ['sprites/ofm_f384/ofm@2x.png', 'image/png', true],
  ])('serves %s as %s', (path, contentType, immutable) => {
    expect(toMapTileRequest(path)).toMatchObject({ path, contentType, immutable, png: contentType === 'image/png' });
  });

  it('names a vector tile’s tile set with its copy', () => {
    expect(toMapTileRequest('planet/20261115_080022_pt/10/536/358.pbf')?.tileset).toBe('planet/20261115_080022_pt');
    expect(toMapTileRequest('backup_planet/20261122_124456_pt/10/536/358.pbf')?.tileset).toBe(
      'backup_planet/20261122_124456_pt',
    );
    expect(toMapTileRequest('styles/dark')?.tileset).toBeUndefined();
  });

  it('marks only the two copies’ TileJSONs as TileJSON', () => {
    expect(toMapTileRequest('planet')?.tileJson).toBe(true);
    expect(toMapTileRequest('backup_planet')?.tileJson).toBe(true);
    expect(toMapTileRequest('styles/dark')?.tileJson).toBeUndefined();
  });

  it.each([
    null,
    '',
    '/styles/dark',
    'styles/liberty',
    'styles/dark/../../etc/passwd',
    'styles/dark?x=1',
    'planet/20261115_080022_pt/15/0/0.pbf',
    'planet/20261115_080022_pt/2/4/0.pbf',
    'planet/../planet',
    'backup_planet/20261122_124456_pt/15/0/0.pbf',
    'backup_planet/../planet',
    'backup_planet/',
    'backup_planet?x=1',
    'Backup_planet',
    'backup',
    'other_planet',
    'planet2',
    'xbackup_planet/20261122_124456_pt/0/0/0.pbf',
    'planet/backup_planet',
    'backup_planet/planet/20261122_124456_pt/0/0/0.pbf',
    'backup_planet/20261122_124456/0/0/0.pbf',
    'natural_earth/20261122_124456_pt/0/0/0.pbf',
    'natural_earth/ne2sr/7/0/0.png',
    'planet/20261115_080022_pt/01/0/0.pbf',
    'planet/20261115_080022_pt/1/00001/0.pbf',
    'natural_earth/ne2sr/2/01/1.png',
    'fonts/Noto%20Sans%20Regular/00-255.pbf',
    'fonts/Arial/0-255.pbf',
    'fonts/Noto%20Sans%20Regular/1-256.pbf',
    'fonts/Noto%20Sans%20Regular/0-1000.pbf',
    'sprites/ofm_f384/other.json',
    'https://evil.example/x',
    '//evil.example/x',
    `planet/${'1'.repeat(300)}`,
  ])('refuses %j', (path) => {
    expect(toMapTileRequest(path)).toBeNull();
  });
});

describe('getTileset', () => {
  const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

  it('reads the tile set the TileJSON’s tiles are in, with its copy', () => {
    expect(
      getTileset(encode({ tiles: ['https://tiles.openfreemap.org/planet/20261115_080022_pt/{z}/{x}/{y}.pbf'] })),
    ).toBe('planet/20261115_080022_pt');
    expect(
      getTileset(encode({ tiles: ['https://tiles.openfreemap.org/backup_planet/20261122_124456_pt/{z}/{x}/{y}.pbf'] })),
    ).toBe('backup_planet/20261122_124456_pt');
  });

  it.each([
    { tiles: ['https://evil.example/planet/20261115_080022_pt/{z}'] },
    { tiles: ['https://tiles.openfreemap.org/other/20261115_080022_pt/{z}'] },
    { tiles: [] },
    {},
    'x',
  ])('reads none from %j', (value) => expect(getTileset(encode(value))).toBeNull());

  it('reads none from bytes that are no JSON', () => {
    expect(getTileset(new Uint8Array([0xff, 0x00]))).toBeNull();
  });
});

describe('getTileJsonRequest', () => {
  it('names the TileJSON of the copy a tile set is in', () => {
    expect(getTileJsonRequest('planet/20261115_080022_pt')).toMatchObject({ path: 'planet', tileJson: true });
    expect(getTileJsonRequest('backup_planet/20261122_124456_pt')).toMatchObject({
      path: 'backup_planet',
      tileJson: true,
    });
  });

  it.each(['styles/dark', 'other/20261115_080022_pt', ''])('names none for %j', (tileset) => {
    expect(getTileJsonRequest(tileset)).toBeNull();
  });
});

describe('toMapRouteUrl', () => {
  const ORIGIN = 'https://pubky.app';

  it('sends an address on the tile host to the app’s route, its path encoded once more', () => {
    expect(
      toMapRouteUrl('https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf', ORIGIN, '/api/map'),
    ).toBe('https://pubky.app/api/map?p=fonts%2FNoto%2520Sans%2520Regular%2F0-255.pbf');
  });

  it.each([
    'https://evil.example/styles/dark',
    'http://tiles.openfreemap.org/styles/dark',
    'https://tiles.openfreemap.org/styles/dark?key=1',
    'not a url',
  ])('sends %s to the route with no path, which refuses it, never to its host', (url) => {
    expect(toMapRouteUrl(url, ORIGIN, '/api/map')).toBe('https://pubky.app/api/map');
  });
});
