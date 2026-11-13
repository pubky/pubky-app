import type { RequestParameters } from 'maplibre-gl';

/** The parts of MapLibre GL the app draws maps with. */
export type TMapLibrary = Pick<typeof import('maplibre-gl'), 'Map' | 'Marker'>;

let library: Promise<TMapLibrary> | null = null;

/**
 * MapLibre GL, loaded on first use (its script, worker and stylesheet are about half a megabyte
 * compressed, so no page pays for them before a map is on screen), once per page load. The worker
 * is the package's own file, served with the app: the library finds it by its own address only
 * when it is not bundled.
 */
export function loadMapLibrary(): Promise<TMapLibrary> {
  library ??= Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]).then(
    ([maplibre]) => {
      maplibre.setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href);
      return maplibre;
    },
    (error: unknown) => {
      // A failed load (a dropped connection) may be tried again by the next map
      library = null;
      throw error;
    },
  );
  return library;
}

/**
 * How every request of a map (style, tiles, fonts, sprites) is sent: without cookies or any other
 * credential, and without a referrer, so the tile host learns neither who looks nor from which
 * page. The address is sent as the style gives it: nothing is added to it.
 *
 * MapLibre hands `credentials` to `Request` as it is, but its type names only `same-origin` and
 * `include`: `omit` is set past it (`Object.assign` keeps the type's own two values).
 */
export function toPrivateMapRequest(url: string): RequestParameters {
  const request: RequestParameters = { url, referrerPolicy: 'no-referrer' };
  return Object.assign(request, { credentials: 'omit' });
}
