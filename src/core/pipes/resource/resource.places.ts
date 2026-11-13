import { RESOURCE_NEARBY_RADIUS_KM, RESOURCE_NEARBY_SHOWN } from '@/config/maps';
import type { TPinakesCard, TPinakesPoint } from '@/services/pinakes/pinakes.types';
import type { TResourceQuery } from './resource.search';

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

/** Rows a place's Nearby asks for: one more than it shows, since the place itself is the nearest. */
export const RESOURCE_NEARBY_LIMIT = RESOURCE_NEARBY_SHOWN + 1;

/**
 * The search of a place's Nearby: the places within `RESOURCE_NEARBY_RADIUS_KM` of its point, the
 * nearest first, one row per thing, from everyone.
 */
export function getNearbyPlacesQuery(point: TPinakesPoint): TResourceQuery {
  return {
    input: { kind: 'all' },
    types: ['Place'],
    sort: 'distance',
    reach: 'all',
    viewer: null,
    collapse: true,
    near: point,
    radiusKm: RESOURCE_NEARBY_RADIUS_KM,
  };
}

/**
 * The rows a place's Nearby shows, in Pinakes' order (nearest first), at most
 * `RESOURCE_NEARBY_SHOWN`: without the place itself (its own card, or another member of its group:
 * the same place on another service), without a row that has no point on the map, each row and
 * each thing once (two rows of one group are one place on two services: the first is kept).
 */
export function pickNearbyPlaces(
  cards: readonly TPinakesCard[],
  self: Pick<TPinakesCard, 'id'> & Partial<Pick<TPinakesCard, 'group'>>,
): TPinakesCard[] {
  const seen = new Set<string>([self.id]);
  // The page's own group first: a row of it is the place itself
  const seenGroups = new Set<string>(self.group?.id != null ? [self.group.id] : []);
  const picked: TPinakesCard[] = [];
  for (const card of cards) {
    const group = card.group?.id ?? null;
    if (seen.has(card.id) || (group !== null && seenGroups.has(group)) || !getMapPoint(card.point)) continue;
    seen.add(card.id);
    if (group !== null) seenGroups.add(group);
    picked.push(card);
  }
  return picked.slice(0, RESOURCE_NEARBY_SHOWN);
}
