'use client';

import { useState, useEffect, useCallback } from 'react';
import * as Core from '@/core';
import * as Libs from '@/libs';
import type { UseHotTagsParams, UseHotTagsResult, HotTag } from './useHotTags.types';
import { DEFAULT_LIMIT } from './useHotTags.constants';

/**
 * useHotTags
 *
 * Hook for fetching hot/trending tags.
 * Uses the HotController to fetch tags with cache-first strategy.
 *
 * @param params - Hook parameters
 * @param params.limit - Maximum number of tags to fetch (default: 5)
 * @param params.reach - Reach filter (e.g., 'followers', 'following')
 * @param params.timeframe - Timeframe filter (default: THIS_MONTH)
 * @returns Hot tags array, loading state, error state, and refetch function
 *
 * @example
 * ```tsx
 * // Simple usage with defaults
 * const { tags, isLoading } = useHotTags({ limit: 5 });
 *
 * // With reach and timeframe filters
 * const { rawTags } = useHotTags({
 *   limit: 3,
 *   reach: UserStreamReach.FOLLOWERS,
 *   timeframe: UserStreamTimeframe.WEEK,
 * });
 * ```
 */
export function useHotTags({
  limit = DEFAULT_LIMIT,
  reach,
  timeframe = Core.UserStreamTimeframe.THIS_MONTH,
}: UseHotTagsParams = {}): UseHotTagsResult {
  const [tags, setTags] = useState<HotTag[]>([]);
  const [rawTags, setRawTags] = useState<Core.NexusHotTag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTags = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const hotTags = await Core.HotController.getOrFetch({
        reach,
        timeframe,
        limit,
      });

      // Store raw tags
      setRawTags(hotTags);

      // Transform NexusHotTag to HotTag format
      const transformedTags: HotTag[] = hotTags.map((tag) => ({
        name: tag.label,
        count: tag.tagged_count,
      }));

      setTags(transformedTags);
      Libs.Logger.debug('[useHotTags] Fetched hot tags', { count: transformedTags.length, reach, timeframe });
    } catch (err) {
      const errorMessage = Libs.isAppError(err) ? err.message : 'Failed to fetch hot tags';
      setError(errorMessage);
      setRawTags([]);
      Libs.Logger.error('[useHotTags] Failed to fetch hot tags:', err);
    } finally {
      setIsLoading(false);
    }
  }, [limit, reach, timeframe]);

  useEffect(() => {
    void fetchTags();
  }, [fetchTags]);

  return {
    tags,
    rawTags,
    isLoading,
    error,
    refetch: fetchTags,
  };
}
