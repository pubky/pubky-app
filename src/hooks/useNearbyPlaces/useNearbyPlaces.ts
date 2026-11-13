'use client';

import { isPinakesConfigured } from '@/config/pinakes';
import { ResourceController } from '@/controllers/resource/resource';
import { usePinakesQuery } from '@/hooks/usePinakesQuery/usePinakesQuery';
import type { UsePinakesQueryResult } from '@/hooks/usePinakesQuery/usePinakesQuery.types';
import { ResourceFamily } from '@/molecules/ResourceCard/ResourceCard.types';
import { getResourceFamily } from '@/molecules/ResourceCard/ResourceCard.utils';
import { getMapPoint } from '@/pipes/resource/resource.places';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';

/** The card fields a place's Nearby is read from. */
export type TNearbyPlaceCard = Pick<TPinakesCard, 'id' | 'type' | 'type_path' | 'point' | 'group'>;

/** The point Nearby looks around: a place's, when it is on the map; `null` for any other card. */
export function getNearbyPoint(card: TNearbyPlaceCard | null | undefined) {
  if (!card || getResourceFamily(card) !== ResourceFamily.PLACE) return null;
  return getMapPoint(card.point);
}

/**
 * The places around a place, nearest first, as links to show as cards
 * (`ResourceController.fetchNearbyPlaces`): at most six, never the place itself. `data` is `[]`
 * when nothing else is near. A card that is no place, or has no point on the map, reads nothing
 * (settled `null`), as does a page without Pinakes.
 *
 * @param card - The page's card, or `null` while it is read
 */
export function useNearbyPlaces(card: TNearbyPlaceCard | null | undefined): UsePinakesQueryResult<string[]> {
  const point = getNearbyPoint(card);
  return usePinakesQuery({
    key: card && point ? `${card.id}:${point.lat},${point.lon}` : '',
    fetchFn: () => ResourceController.fetchNearbyPlaces({ point: point!, self: { id: card!.id, group: card!.group } }),
    enabled: point !== null && isPinakesConfigured(),
  });
}
