'use client';

import type { TResourceFeedSearch } from '@/hooks/useSearchResourceQuery/useSearchResourceQuery';
import { useHomeStore } from '@/stores/home/home.store';
import { REACH } from '@/stores/home/home.types';

/**
 * Home's External resources as a feed search (`TResourceFeedSearch`): every resource in the Home
 * reach, the Home sort the order without one picked. Tagged as is no reach the resource search has
 * (the filter shows All): the My network under it is not searched.
 */
export function useHomeResourceFeed(): TResourceFeedSearch {
  const storeReach = useHomeStore((state) => state.reach);
  const isTaggedAs = useHomeStore((state) => state.taggedAsActive && state.profileTags.length > 0);
  const sort = useHomeStore((state) => state.sort);
  const reach = isTaggedAs && storeReach === REACH.NETWORK ? REACH.ALL : storeReach;
  return { tags: [], reach, sort };
}
