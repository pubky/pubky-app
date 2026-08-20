'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseInfiniteScrollOptions {
  onLoadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
  threshold?: number; // Distance from bottom to trigger load (in pixels)
  debounceMs?: number; // Debounce time to prevent rapid calls
  /**
   * Current rendered item count. Together with `maxUnproductiveLoads`, enables the
   * unproductive-load budget: consecutive automatic loads that fail to grow this count
   * are budgeted, and when the budget runs out auto-loading stalls (`isStalled`) until
   * the consumer calls `resumeAutoLoad` — typically from a manual "Load more" button.
   *
   * Needed when items collapse or filter after fetching (grouping, muting): a page that
   * merges entirely into existing rows keeps the sentinel on screen and would otherwise
   * chain loads to the end of the stream.
   */
  itemCount?: number;
  /** Consecutive automatic loads allowed without `itemCount` growing. */
  maxUnproductiveLoads?: number;
}

export const useInfiniteScroll = ({
  onLoadMore,
  hasMore,
  isLoading,
  threshold = 200,
  debounceMs = 300,
  itemCount,
  maxUnproductiveLoads,
}: UseInfiniteScrollOptions) => {
  // Use state to track sentinel element - this ensures useEffect re-runs when sentinel mounts
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const [isStalled, setIsStalled] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const onLoadMoreRef = useRef(onLoadMore);

  const budgetEnabled = itemCount !== undefined && maxUnproductiveLoads !== undefined;
  // The debounced trigger fires from a timeout, so it reads the budget through refs to
  // avoid stale closures — same reason onLoadMore lives in a ref.
  const budgetRef = useRef({ itemCount, maxUnproductiveLoads, enabled: budgetEnabled });
  const highWaterRef = useRef(itemCount ?? 0);
  const unproductiveLoadsRef = useRef(0);

  // Keep onLoadMore ref updated to avoid stale closures
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    budgetRef.current = { itemCount, maxUnproductiveLoads, enabled: budgetEnabled };
  }, [itemCount, maxUnproductiveLoads, budgetEnabled]);

  // A refresh can replace the list with a shorter one while the consumer stays mounted.
  // The stale high-water mark would then miscount every productive load as unproductive,
  // so shrinkage resets the budget and re-arms auto-loading.
  useEffect(() => {
    if (!budgetEnabled || itemCount === undefined) return;
    if (itemCount < highWaterRef.current) {
      highWaterRef.current = itemCount;
      unproductiveLoadsRef.current = 0;
      setIsStalled(false);
    }
  }, [budgetEnabled, itemCount]);

  // Callback ref - called when element mounts/unmounts
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    setSentinel(node);
  }, []);

  const debouncedLoadMore = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      const budget = budgetRef.current;
      if (budget.enabled) {
        const count = budget.itemCount ?? 0;
        if (count > highWaterRef.current) {
          highWaterRef.current = count;
          unproductiveLoadsRef.current = 0;
        }

        unproductiveLoadsRef.current += 1;
        if (unproductiveLoadsRef.current > (budget.maxUnproductiveLoads ?? Infinity)) {
          setIsStalled(true);
          return;
        }
      }

      onLoadMoreRef.current();
    }, debounceMs);
  }, [debounceMs]);

  /** Clears a stall and immediately loads the next page. Wire to a manual load button. */
  const resumeAutoLoad = () => {
    unproductiveLoadsRef.current = 0;
    setIsStalled(false);
    onLoadMoreRef.current();
  };

  useEffect(() => {
    if (!sentinel || !hasMore || isLoading || isStalled) return;

    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      const target = entries[0];
      if (target.isIntersecting) {
        debouncedLoadMore();
      }
    };

    const observer = new IntersectionObserver(handleIntersection, {
      root: null,
      rootMargin: `${threshold}px`,
      threshold: 0.1,
    });

    observer.observe(sentinel);

    return () => {
      observer.unobserve(sentinel);
      observer.disconnect();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [sentinel, hasMore, isLoading, isStalled, threshold, debouncedLoadMore]);

  return { sentinelRef, isStalled, resumeAutoLoad };
};
