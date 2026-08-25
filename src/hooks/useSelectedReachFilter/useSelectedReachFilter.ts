'use client';

import { TAGGED_AS_FILTER_KEY } from '@/config/feed';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useHomeStore } from '@/stores/home/home.store';
import { type ReachFilterValue } from '@/stores/home/home.types';
import { REACH } from '@/stores/home/home.types';

/**
 * The reach filter value the home feed currently shows: the persisted reach,
 * with Tagged as counting as a selection while it has profile tags, and All
 * forced for signed-out visitors. Single source for every surface mirroring
 * the reach selection (sidebar filter highlight, feed navigation tab).
 */
export function useSelectedReachFilter(): ReachFilterValue {
  const reach = useHomeStore((state) => state.reach);
  const taggedAsActive = useHomeStore((state) => state.taggedAsActive);
  const profileTags = useHomeStore((state) => state.profileTags);
  const { isAuthenticated } = useRequireAuth();

  if (!isAuthenticated) return REACH.ALL;
  return taggedAsActive && profileTags.length > 0 ? TAGGED_AS_FILTER_KEY : reach;
}
