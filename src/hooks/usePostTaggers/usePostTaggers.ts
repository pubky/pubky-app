'use client';

import { useEffect, useRef, useState } from 'react';
import * as Core from '@/core';
import * as Libs from '@/libs';
import { TAGGERS_PAGE_SIZE } from './usePostTaggers.constants';
import type { TaggersStateMap, UsePostTaggersResult } from './usePostTaggers.types';

/**
 * Hook to fetch and cache full tagger lists for post tags on demand.
 *
 * Features:
 * - Lazy loading: Taggers are only fetched when explicitly requested
 * - Pagination: Automatically fetches all pages of taggers
 * - Caching: Results are cached per tag label to avoid re-fetching
 * - Deduplication: Handles duplicate tagger IDs across pages
 *
 * @param postId - The composite post ID (author:postId format). Pass null/undefined to disable fetching.
 * @returns Object containing tagger data and fetch function
 */
export function usePostTaggers(postId?: string | null): UsePostTaggersResult {
  const [taggerStates, setTaggerStates] = useState<TaggersStateMap>(new Map());

  const statesRef = useRef(taggerStates);

  useEffect(() => {
    statesRef.current = taggerStates;
  }, [taggerStates]);

  useEffect(() => {
    setTaggerStates(new Map());
  }, [postId]);

  /**
   * Fetches all taggers for a specific tag label with pagination.
   *
   * @param label - The tag label to fetch taggers for (case-insensitive)
   * @param initialIds - Initial tagger IDs already known from the tag response
   * @param totalCount - Expected total count of taggers (used for pagination control)
   */
  const fetchAllTaggers = async (label: string, initialIds: Core.Pubky[], totalCount?: number) => {
    if (!postId) return;
    const labelKey = label.toLowerCase();
    const existing = statesRef.current.get(labelKey);
    if (existing?.isLoading) return;
    if (existing && existing.totalCount !== undefined && existing.ids.length >= existing.totalCount) {
      return;
    }

    setTaggerStates((prev) => {
      const next = new Map(prev);
      next.set(labelKey, {
        ids: initialIds,
        skip: initialIds.length,
        isLoading: true,
        hasMore: totalCount ? initialIds.length < totalCount : true,
        totalCount,
      });
      return next;
    });

    try {
      const MAX_ITERATIONS = 100; // Safeguard against infinite loops
      let skip = initialIds.length;
      let collectedIds = [...initialIds];
      let hasMore = true;
      let iterations = 0;

      while (hasMore && iterations < MAX_ITERATIONS) {
        iterations++;
        const response = await Core.PostController.fetchTaggers({
          compositeId: postId,
          label,
          skip,
          limit: TAGGERS_PAGE_SIZE,
        });

        // Flatten nested users arrays: NexusTaggers[] → Pubky[]
        const pageTaggers = response.flatMap((entry) => entry.users ?? []);
        if (pageTaggers.length === 0) break;

        const uniqueBefore = new Set(collectedIds).size;
        collectedIds = Array.from(new Set([...collectedIds, ...pageTaggers])) as Core.Pubky[];
        const uniqueAfter = new Set(collectedIds).size;

        // Only break on duplicates if we don't have a reliable totalCount
        if (uniqueAfter === uniqueBefore && totalCount === undefined) break;

        skip += pageTaggers.length;

        if (totalCount !== undefined) {
          hasMore = collectedIds.length < totalCount;
        } else if (pageTaggers.length < TAGGERS_PAGE_SIZE) {
          hasMore = false;
        }
      }

      setTaggerStates((prev) => {
        const next = new Map(prev);
        const existing = next.get(labelKey);
        if (!existing) return prev;
        next.set(labelKey, {
          ...existing,
          ids: collectedIds,
          skip,
          isLoading: false,
          hasMore: false,
        });
        return next;
      });
    } catch (error) {
      Libs.Logger.error('[usePostTaggers] Failed to fetch taggers', { postId, label, error });
      setTaggerStates((prev) => {
        const next = new Map(prev);
        const existing = next.get(labelKey);
        if (!existing) return prev;
        next.set(labelKey, { ...existing, isLoading: false, hasMore: false });
        return next;
      });
    }
  };

  const taggersByLabel = new Map<string, Core.Pubky[]>();
  taggerStates.forEach((value, key) => {
    taggersByLabel.set(key, value.ids);
  });

  return {
    taggersByLabel,
    taggerStates,
    fetchAllTaggers,
  };
}
