'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslations } from 'next-intl';
import * as Core from '@/core';
// Import directly to avoid circular dependency with @/hooks barrel
import { useProfileStats } from '@/hooks/useProfileStats';
import { toast } from '@/molecules/Toaster/use-toast';
import type { UseTaggedResult, UseTaggedOptions } from './useTagged.types';
import { transformTagsForViewer } from '@/molecules/TaggedItem/TaggedItem.utils';
import { TAGS_PER_PAGE } from './useTagged.constants';
import { Logger } from '@/libs/logger/logger';

/**
 * Unified hook for fetching and managing user tags.
 * Uses useLiveQuery on IndexedDB for automatic reactivity across all instances.
 *
 * The TagController.commitCreate/commitDelete methods use local-first writes with
 * compensation rollback, so useLiveQuery reacts immediately and failed homeserver
 * writes are reverted back out of IndexedDB.
 */
export function useTagged(userId: string | null | undefined, options: UseTaggedOptions = {}): UseTaggedResult {
  const { enablePagination = true, enableStats = true, viewerId: customViewerId } = options;
  const tTags = useTranslations('toast.tags');

  // selectCurrentUserPubky() throws an error when user is not authenticated;
  // access currentUserPubky directly to get null instead (e.g., during logout or unauthenticated views)
  const currentUserId = Core.useAuthStore((state) => state.currentUserPubky);
  const viewerId = customViewerId ?? currentUserId;

  // Track zero-tagger tags with their original index for order preservation
  const [zeroTaggerTags, setZeroTaggerTags] = useState<Map<string, { tag: Core.NexusTag; index: number }>>(new Map());

  // Track the order of tags as they were originally loaded
  const [tagOrder, setTagOrder] = useState<Map<string, number>>(new Map());

  // Only fetch stats if enabled
  const { stats, isLoading: isLoadingStats } = useProfileStats(enableStats ? (userId ?? '') : '');

  // Fetch tags directly from IndexedDB - this will react to any changes made by TagController
  const localTags = useLiveQuery(async () => {
    try {
      if (!userId) return undefined;
      const tags = await Core.UserController.getTags({ userId });
      return tags.length > 0 ? tags : null;
    } catch (error) {
      Logger.error('[useTagged] Failed to query user tags', { userId, error });
      return null;
    }
  }, [userId]);

  // Update tag order map when localTags change (only for new tags)
  useEffect(() => {
    if (!localTags) return;

    setTagOrder((prevOrder) => {
      let hasChanges = false;
      const newOrder = new Map(prevOrder);

      localTags.forEach((tag) => {
        const labelLower = tag.label.toLowerCase();
        if (!newOrder.has(labelLower)) {
          newOrder.set(labelLower, newOrder.size);
          hasChanges = true;
        }
      });

      return hasChanges ? newOrder : prevOrder;
    });
  }, [localTags]);

  // Track if we've already fetched from server for this user
  const [hasFetched, setHasFetched] = useState(false);
  const prevUserIdRef = useRef<string | null | undefined>(null);

  // Reset hasFetched when userId changes
  useEffect(() => {
    if (prevUserIdRef.current !== userId) {
      setHasFetched(false);
      prevUserIdRef.current = userId;
    }
  }, [userId]);

  // Initial fetch from server (always fetch to ensure we have all tags)
  useEffect(() => {
    if (!userId || hasFetched) return;

    const fetchTags = async () => {
      try {
        // Fetch from server
        const fetchedTags = await Core.UserController.fetchTags({
          user_id: userId,
          viewer_id: viewerId ?? undefined,
          ...(enablePagination && { limit_tags: TAGS_PER_PAGE, skip_tags: 0 }),
        });

        // Save to IndexedDB so useLiveQuery reacts
        await Core.UserController.upsertTags(userId, fetchedTags);

        setHasFetched(true);
      } catch {
        // Ignore fetch errors - we'll show empty state
        setHasFetched(true);
      }
    };

    fetchTags();
  }, [userId, viewerId, enablePagination, hasFetched]);

  // Combine local tags with zero-tagger tags, preserving order
  const allTags = useMemo(() => {
    const baseTags = localTags ?? [];
    const baseTagLabels = new Set(baseTags.map((t) => t.label.toLowerCase()));

    // Get zero-tagger tags that aren't in baseTags
    const zeroTagsToAdd: Array<{ tag: Core.NexusTag; index: number }> = [];
    zeroTaggerTags.forEach((value, label) => {
      if (!baseTagLabels.has(label)) {
        zeroTagsToAdd.push(value);
      }
    });

    if (zeroTagsToAdd.length === 0) {
      return baseTags;
    }

    // Merge and sort by original index
    const allTagsWithIndex = [
      ...baseTags.map((tag) => ({
        tag,
        index: tagOrder.get(tag.label.toLowerCase()) ?? Infinity,
      })),
      ...zeroTagsToAdd,
    ];

    // Sort by original index to preserve order
    allTagsWithIndex.sort((a, b) => a.index - b.index);

    return allTagsWithIndex.map((item) => item.tag);
  }, [localTags, zeroTaggerTags, tagOrder]);

  const handleTagAdd = useCallback(
    async (tagString: string): Promise<{ success: boolean; error?: string }> => {
      const label = tagString.trim();

      if (!label) return { success: false, error: 'Tag label cannot be empty' };
      if (!userId) return { success: false, error: 'User ID is required' };
      if (!viewerId) return { success: false, error: 'You must be logged in to add tags' };

      // Check if user already tagged
      const existingTag = allTags.find((t) => t.label.toLowerCase() === label.toLowerCase());
      if (existingTag?.taggers?.includes(viewerId)) {
        return { success: false, error: 'You have already added this tag' };
      }

      try {
        // TagController.commitCreate updates IndexedDB first and rolls back on homeserver failure.
        // useLiveQuery will automatically react to the local change or rollback.
        await Core.TagController.commitCreate({
          taggedId: userId as Core.Pubky,
          label,
          taggerId: viewerId,
          taggedKind: Core.TagKind.USER,
        });

        // Remove from zero-tagger list if it was there
        const labelLower = label.toLowerCase();
        setZeroTaggerTags((prev) => {
          const next = new Map(prev);
          next.delete(labelLower);
          return next;
        });

        toast({
          title: tTags('added'),
          description: tTags('addedDesc', { label }),
        });
        return { success: true };
      } catch {
        toast({
          title: tTags('addFailed'),
          description: tTags('addFailedDesc', { label }),
        });
        return { success: false, error: 'Failed to add tag' };
      }
    },
    [userId, viewerId, allTags, tTags],
  );

  const handleTagToggle = useCallback(
    async (tag: { label: string; relationship?: boolean }): Promise<void> => {
      if (!userId || !viewerId) return;

      const currentTagIndex = allTags.findIndex((t) => t.label === tag.label);
      const currentTag = currentTagIndex >= 0 ? allTags[currentTagIndex] : undefined;
      // Use relationship from tag (from transformTagsForViewer) which is more reliable
      // than checking the taggers array which may be truncated
      const userIsTagger =
        tag.relationship ?? currentTag?.relationship ?? currentTag?.taggers?.includes(viewerId) ?? false;
      const labelLower = tag.label.toLowerCase();

      try {
        const params = {
          taggedId: userId as Core.Pubky,
          label: tag.label,
          taggerId: viewerId,
          taggedKind: Core.TagKind.USER,
        };
        if (userIsTagger) {
          // Track zero-tagger tag BEFORE delete to preserve order
          if (currentTag && (currentTag.taggers_count ?? 0) <= 1) {
            const originalIndex = tagOrder.get(labelLower) ?? currentTagIndex;
            const zeroTag: Core.NexusTag = {
              ...currentTag,
              taggers: [],
              taggers_count: 0,
              relationship: false,
            };
            setZeroTaggerTags((prev) => {
              const next = new Map(prev);
              next.set(labelLower, { tag: zeroTag, index: originalIndex });
              return next;
            });
          }

          // TagController.commitDelete updates IndexedDB first and rolls back on homeserver failure.
          await Core.TagController.commitDelete(params);

          toast({
            title: tTags('removed'),
            description: tTags('removedDesc', { label: tag.label }),
          });
        } else {
          // TagController.commitCreate updates IndexedDB first and rolls back on homeserver failure.
          await Core.TagController.commitCreate(params);

          // Remove from zero-tagger list
          setZeroTaggerTags((prev) => {
            const next = new Map(prev);
            next.delete(labelLower);
            return next;
          });

          toast({
            title: tTags('added'),
            description: tTags('addedDesc', { label: tag.label }),
          });
        }
      } catch {
        // Rollback zero-tagger state on error
        if (userIsTagger) {
          setZeroTaggerTags((prev) => {
            const next = new Map(prev);
            next.delete(labelLower);
            return next;
          });
        }
        toast({
          title: userIsTagger ? tTags('removeFailed') : tTags('addFailed'),
          description: userIsTagger
            ? tTags('removeFailedDesc', { label: tag.label })
            : tTags('addFailedDesc', { label: tag.label }),
        });
      }
    },
    [userId, viewerId, allTags, tagOrder, tTags],
  );

  // Use actual total count from stats to determine if there are more tags
  const hasMore = enablePagination && allTags.length >= TAGS_PER_PAGE && allTags.length < stats.uniqueTags;

  const loadMore = useCallback(async () => {
    if (!enablePagination || !userId || !hasMore) return;

    try {
      const moreTags = await Core.UserController.fetchTags({
        user_id: userId,
        viewer_id: viewerId ?? undefined,
        limit_tags: TAGS_PER_PAGE,
        skip_tags: allTags.length,
      });

      // Merge with existing tags and save to IndexedDB
      if (moreTags.length > 0) {
        const existingLabels = new Set(allTags.map((t) => t.label.toLowerCase()));
        const newTags = moreTags.filter((t) => !existingLabels.has(t.label.toLowerCase()));
        const mergedTags = [...allTags, ...newTags];

        await Core.UserController.upsertTags(userId, mergedTags);
      }
    } catch {
      // Ignore pagination errors
    }
  }, [enablePagination, userId, viewerId, allTags, hasMore]);

  const isLoading = localTags === undefined || (enableStats && isLoadingStats);

  const tagsWithAvatars = useMemo(() => transformTagsForViewer(allTags, viewerId), [allTags, viewerId]);

  return {
    tags: tagsWithAvatars,
    count: enableStats ? stats.uniqueTags : 0,
    isLoading,
    isLoadingMore: false,
    hasMore: enablePagination ? hasMore : false,
    loadMore,
    handleTagAdd,
    handleTagToggle,
  };
}
