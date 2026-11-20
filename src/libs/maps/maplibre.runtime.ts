import 'maplibre-gl/dist/maplibre-gl.css';
import { Map, Marker, setWorkerUrl } from 'maplibre-gl';
import type { TMapLibrary } from './maplibre';

/**
 * MapLibre GL with its stylesheet and its worker, as one lazily loaded unit: only `loadMapLibrary`
 * imports this module, and only dynamically, so the library, the stylesheet and the reference to
 * the worker file all stay out of the app's own chunks (and out of the service worker's precache,
 * `next.config.ts`).
 *
 * The worker is the package's own file, emitted with the app's static files. The library finds it
 * by its own address only when it is not bundled, so it is told here.
 */
setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href);

export const mapLibrary: TMapLibrary = { Map, Marker };
