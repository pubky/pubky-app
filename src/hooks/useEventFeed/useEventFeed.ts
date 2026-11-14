'use client';

import { isPinakesConfigured } from '@/config/pinakes';
import { PinakesController } from '@/controllers/pinakes/pinakes';
import { usePinakesQuery } from '@/hooks/usePinakesQuery/usePinakesQuery';
import { getEventFeed, type TEventFeed } from '@/pipes/resource/resource.events';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';

export interface UseEventFeedResult {
  /** The feed the date is part of; `null` while read, and for an event that is part of none. */
  feed: TEventFeed | null;
  /** The card's group is being read to find it. */
  isLoading: boolean;
}

/**
 * The calendar feed an event's date is part of (`getEventFeed`): a feed's own date names it; a date
 * page's group has the feed's date of it as a member. The group is the one another reader already
 * read (`getCachedGroup`: the resource page, a card's footer), else the shared group read
 * (`fetchGroup`, cached for every card of the group). An event outside a group, or a feed's own date,
 * asks nothing.
 *
 * @param card - The event's card
 * @param options.enabled - `false` asks nothing yet (a card not on screen yet)
 */
export function useEventFeed(
  card: Pick<TPinakesCard, 'group' | 'occurrence'> | null | undefined,
  { enabled = true }: { enabled?: boolean } = {},
): UseEventFeedResult {
  const ownFeed = card?.occurrence ? getEventFeed(card, null) : null;
  const groupId = !ownFeed && (card?.group?.size ?? 0) > 1 ? (card?.group?.id ?? null) : null;
  const { data: group, isLoading } = usePinakesQuery({
    key: groupId ?? '',
    fetchFn: async () =>
      PinakesController.getCachedGroup({ id: groupId! }) ?? PinakesController.fetchGroup({ id: groupId! }),
    enabled: enabled && Boolean(groupId) && isPinakesConfigured(),
  });
  if (ownFeed) return { feed: ownFeed, isLoading: false };
  return { feed: card && group ? getEventFeed(card, group.members) : null, isLoading };
}
