import type { RequestParameters } from 'maplibre-gl';
import { MAP_TILE_ROUTE } from '@/config/maps';
import { toMapRouteUrl } from '@/pipes/map-tile/map-tile';

/** The parts of MapLibre GL the app draws maps with. */
export type TMapLibrary = Pick<typeof import('maplibre-gl'), 'Map' | 'Marker'>;

let library: Promise<TMapLibrary> | null = null;

/**
 * MapLibre GL, loaded on first use (its script, worker and stylesheet are about half a megabyte
 * compressed, so no page pays for them before a map is on screen, or about to be: a search's Map
 * button asks for it as the pointer or the keyboard reaches it), once per page load
 * (`maplibre.runtime`).
 */
export function loadMapLibrary(): Promise<TMapLibrary> {
  library ??= import('./maplibre.runtime').then(
    ({ mapLibrary }) => mapLibrary,
    (error: unknown) => {
      // A failed load (a dropped connection) may be tried again by the next map
      library = null;
      throw error;
    },
  );
  return library;
}

/**
 * How every request of a map (style, tiles, fonts, sprites) is sent: to the app's own map route
 * (`MAP_TILE_ROUTE`, `toMapRouteUrl`), which reads the tile host itself, so the viewer's browser asks no
 * other host; without cookies or any other credential, and without a referrer. An address on any other
 * host, or with a query (none of the app's styles names one), goes to the route with no path, which
 * refuses it: never to that host.
 *
 * MapLibre hands `credentials` to `Request` as it is, but its type names only `same-origin` and
 * `include`: `omit` is set past it (`Object.assign` keeps the type's own two values).
 */
export function toPrivateMapRequest(url: string): RequestParameters {
  const request: RequestParameters = {
    url: toMapRouteUrl(url, window.location.origin, MAP_TILE_ROUTE),
    referrerPolicy: 'no-referrer',
  };
  return Object.assign(request, { credentials: 'omit' });
}
