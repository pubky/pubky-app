'use client';

import { useEffect } from 'react';
import { useFeedOptimisticStore } from '@/stores/feedOptimistic/feedOptimistic.store';

/**
 * useApplyPendingFeedInsert
 *
 * Drains post ids the global FAB enqueued for this feed (keyed by feed identity)
 * and replays them into the feed's own in-memory `prependOptimisticPosts`. This
 * is the page-side half of the layout↔page bridge: the FAB cannot reach this
 * feed's `TimelineFeedContext` because it renders outside the feed's tree.
 *
 * `prependOptimisticPosts` dedupes against already-displayed ids, so the apply
 * is idempotent and safe under React Strict Mode double-invokes.
 *
 * @param key - The feed key from `buildFeedKey`, or `undefined` to disable.
 * @param prependOptimisticPosts - The feed's optimistic prepend from `useStreamPagination`.
 */
export function useApplyPendingFeedInsert(
  key: string | undefined,
  prependOptimisticPosts: (postIds: string | string[]) => void,
): void {
  const pending = useFeedOptimisticStore((state) => (key ? state.pendingByKey[key] : undefined));
  const clear = useFeedOptimisticStore((state) => state.clear);

  useEffect(() => {
    if (!key || !pending || pending.length === 0) return;
    prependOptimisticPosts(pending);
    clear(key);
  }, [key, pending, clear, prependOptimisticPosts]);
}
