'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TAGGERS_PAGE_SIZE } from './usePostTaggers.constants';
import type { TaggersStateMap, UsePostTaggersResult } from './usePostTaggers.types';
import { Logger } from '@/libs/logger/logger';
import { PostController } from '@/controllers/post/post';
import type { Pubky } from '@/models/models.types';
import type { NexusTaggers } from '@/services/nexus/nexus.types';
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
  const fetchAllTaggers = useCallback(
    async (label: string, initialIds: Pubky[], totalCount?: number) => {
      if (!postId) return;
      const labelKey = label.toLowerCase();
      const existing = statesRef.current.get(labelKey);
      if (existing?.isLoading) return;
      if (existing && !existing.hasMore) return;
      if (existing && existing.totalCount !== undefined && existing.ids.length >= existing.totalCount) {
        return;
      }

      const seedIds = existing?.ids.length ? existing.ids : initialIds;

      setTaggerStates((prev) => {
        const next = new Map(prev);
        next.set(labelKey, {
          ids: seedIds,
          skip: seedIds.length,
          isLoading: true,
          hasMore: totalCount !== undefined ? seedIds.length < totalCount : true,
          totalCount,
        });
        return next;
      });

      try {
        const MAX_ITERATIONS = 100; // Safeguard against infinite loops
        let skip = seedIds.length;
        let collectedIds = [...seedIds];
        let hasMore = totalCount !== undefined ? collectedIds.length < totalCount : true;
        let iterations = 0;

        while (hasMore && iterations < MAX_ITERATIONS) {
          iterations++;
          const response = (await PostController.fetchTaggers({
            compositeId: postId,
            label,
            skip,
            limit: TAGGERS_PAGE_SIZE,
          })) as NexusTaggers | NexusTaggers[];

          // Post taggers endpoint returns { users, relationship }.
          // Keep legacy array parsing as fallback for compatibility.
          const pageTaggers = Array.isArray(response)
            ? response.flatMap((entry) => entry.users ?? [])
            : (response.users ?? []);
          if (pageTaggers.length === 0) break;

          const uniqueBefore = new Set(collectedIds).size;
          collectedIds = Array.from(new Set([...collectedIds, ...pageTaggers])) as Pubky[];
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
          const currentState = next.get(labelKey);
          if (!currentState) return prev;
          next.set(labelKey, {
            ...currentState,
            ids: collectedIds,
            skip,
            isLoading: false,
            hasMore,
          });
          return next;
        });
      } catch (error) {
        Logger.error('[usePostTaggers] Failed to fetch taggers', { postId, label, error });
        setTaggerStates((prev) => {
          const next = new Map(prev);
          const currentState = next.get(labelKey);
          if (!currentState) return prev;
          next.set(labelKey, { ...currentState, isLoading: false, hasMore: currentState.hasMore });
          return next;
        });
      }
    },
    [postId],
  );

  const taggersByLabel = new Map<string, Pubky[]>();
  taggerStates.forEach((value, key) => {
    taggersByLabel.set(key, value.ids);
  });

  return {
    taggersByLabel,
    taggerStates,
    fetchAllTaggers,
  };
}
