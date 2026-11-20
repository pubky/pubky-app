/**
 * Maps of places and events: MapLibre GL draws OpenFreeMap's vector tiles (OpenStreetMap data), with
 * no key and no account. One host serves the style, the tiles, the fonts and the sprites.
 */

/** The map's style in each theme (`useThemePreference`). */
export const MAP_STYLE_URLS = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
} as const;

/** The credit shown with every map that is drawn, each part linked. */
export const MAP_ATTRIBUTION: readonly { label: string; href: string }[] = [
  { label: 'OpenFreeMap', href: 'https://openfreemap.org' },
  { label: '© OpenMapTiles', href: 'https://www.openmaptiles.org/' },
  { label: 'Data from OpenStreetMap', href: 'https://www.openstreetmap.org/copyright' },
];

/** How close a card's small map shows its point: the streets around it. */
export const MAP_PREVIEW_ZOOM = 14;
/** How close the resource page's larger map shows its point: the houses around it. */
export const MAP_DETAIL_ZOOM = 15;
/** The closest a map of several points fits them (one street), so near points are not shown as one. */
export const MAP_FIT_MAX_ZOOM = 16;
/** The space kept around the points a map fits (px). */
export const MAP_FIT_PADDING_PX = 48;

/**
 * How long a map waits for a lost WebGL context to come back before it says it is unavailable: the
 * library restores one itself within moments when it restarts its workers.
 */
export const MAP_CONTEXT_RESTORE_MS = 2000;

/**
 * Results a map of a search shows at most: past that it loads no more and says so. A map of more
 * pins than this says little, and its pins are grouped again on every zoom.
 */
export const MAP_RESULTS_MAX = 200;

/** Places a place's page lists under Nearby. */
export const RESOURCE_NEARBY_SHOWN = 6;
/** How far around a place its Nearby looks (km). */
export const RESOURCE_NEARBY_RADIUS_KM = 2;
