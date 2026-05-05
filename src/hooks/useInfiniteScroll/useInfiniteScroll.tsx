'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseInfiniteScrollOptions {
  onLoadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
  threshold?: number; // Distance from bottom to trigger load (in pixels)
  debounceMs?: number; // Debounce time to prevent rapid calls
}

export const useInfiniteScroll = ({
  onLoadMore,
  hasMore,
  isLoading,
  threshold = 200,
  debounceMs = 300,
}: UseInfiniteScrollOptions) => {
  // Use state to track sentinel element - this ensures useEffect re-runs when sentinel mounts
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const onLoadMoreRef = useRef(onLoadMore);

  // Keep onLoadMore ref updated to avoid stale closures
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  // Callback ref - called when element mounts/unmounts
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    setSentinel(node);
  }, []);

  const debouncedLoadMore = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      onLoadMoreRef.current();
    }, debounceMs);
  }, [debounceMs]);

  useEffect(() => {
    if (!sentinel || !hasMore || isLoading) return;

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
  }, [sentinel, hasMore, isLoading, threshold, debouncedLoadMore]);

  return { sentinelRef };
};
