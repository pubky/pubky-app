import { ResourceFamily } from '@/molecules/ResourceCard/ResourceCard.types';
import { getResourceFamily } from '@/molecules/ResourceCard/ResourceCard.utils';
import { formatAddress } from '@/molecules/ResourceCard/ResourceFacts.utils';
import type { TPinakesCard, TPinakesPoint, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';

/** Where a place or an event is, for a map and for a maps app. */
export type TMapsDestination = {
  /** The point to show and to open; `null` when only the address is known. */
  point: TPinakesPoint | null;
  /** What the point is called: an event's venue, else the card's name. */
  label: string | null;
  /** The address in one line (`formatAddress`). */
  address: string | null;
};

/** The maps apps a destination opens in; `geo` is the device's own default app. */
export type TMapsApp = 'geo' | 'apple' | 'google' | 'osm';

/** The card fields a destination is read from. */
type TMapsCard = Pick<TPinakesCard, 'type' | 'type_path' | 'name' | 'point'> &
  Partial<Pick<TPinakesResourceDetail, 'address' | 'venue'>>;

/** Decimals of a coordinate in a link or a copied text: about a metre. */
const COORDINATE_DECIMALS = 5;
/** The zoom OpenStreetMap opens a point at: a street and its houses. */
const OSM_POINT_ZOOM = 17;

/**
 * `point` when it can be put on a map: both numbers finite, the latitude within ±90 and the
 * longitude within ±180. Anything else (a card without one, a value another type slipped into) is
 * `null`, so no map and no link is ever made from it.
 */
export function getMapPoint(point: unknown): TPinakesPoint | null {
  if (typeof point !== 'object' || point === null) return null;
  const { lat, lon } = point as { lat?: unknown; lon?: unknown };
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

const text = (value: string | null | undefined) => value?.trim() || null;

/**
 * Where a place or an event is: its point when it is on the map (`getMapPoint`), else its address
 * when that names a street or a city. `null` for every other card, and for a place or an event
 * that says neither (an online event, one whose venue is only a name): nothing is made up from a
 * name, so such a card gets no map and no way to a maps app.
 *
 * @param locale - For tests; the viewer's locale when omitted
 */
export function getMapsDestination(card: TMapsCard, locale?: string): TMapsDestination | null {
  const family = getResourceFamily(card);
  if (family !== ResourceFamily.PLACE && family !== ResourceFamily.EVENT) return null;
  const point = getMapPoint(card.point);
  const isAddressed = Boolean(text(card.address?.street) || text(card.address?.city));
  if (!point && !isAddressed) return null;
  const venue = family === ResourceFamily.EVENT ? text(card.venue?.name) : null;
  return { point, label: venue ?? text(card.name), address: formatAddress(card.address, locale) };
}

const round = (value: number) => String(Number(value.toFixed(COORDINATE_DECIMALS)));

/** A point as `latitude, longitude`, to about a metre: what "Copy coordinates" copies. */
export function formatCoordinates(point: TPinakesPoint): string {
  return `${round(point.lat)}, ${round(point.lon)}`;
}

/** A `geo:` query value: brackets too are escaped, since they close the point's label there. */
const encodeGeoText = (value: string) =>
  encodeURIComponent(value).replace(/[()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * The link that opens a destination in each maps app: at its point, named by its label where the
 * app shows one, else as a search for its address. `geo:` is the device's default maps app (the
 * `?q=` form phones read: a pin with a label, or a search). Nothing but the place itself is in a
 * link: no resource link, no viewer.
 */
export function getMapsLinks({ point, label, address }: TMapsDestination): Record<TMapsApp, string> {
  if (!point) {
    const query = address ?? label ?? '';
    const search = new URLSearchParams({ query }).toString();
    return {
      geo: `geo:0,0?q=${encodeGeoText(query)}`,
      apple: `https://maps.apple.com/?${new URLSearchParams({ q: query })}`,
      google: `https://www.google.com/maps/search/?api=1&${search}`,
      osm: `https://www.openstreetmap.org/search?${search}`,
    };
  }
  const [lat, lon] = [round(point.lat), round(point.lon)];
  const pair = `${lat},${lon}`;
  return {
    geo: `geo:${pair}?q=${pair}${label ? `(${encodeGeoText(label)})` : ''}`,
    apple: `https://maps.apple.com/?${new URLSearchParams({ ll: pair, q: label ?? pair })}`,
    google: `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: pair })}`,
    osm: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${OSM_POINT_ZOOM}/${lat}/${lon}`,
  };
}
