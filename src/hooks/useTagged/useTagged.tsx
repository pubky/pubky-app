'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TagKind } from '@/application/tag/tag.types';
import { TagController } from '@/controllers/tag/tag';
import { useProfileStats } from '@/hooks/useProfileStats/useProfileStats';
import { useTagCache } from '@/hooks/useTagCache/useTagCache';
import type { Pubky } from '@/models/models.types';
import { transformTagsForViewer } from '@/molecules/TaggedItem/TaggedItem.utils';
import { toast } from '@/molecules/Toaster/toast';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { UseTaggedOptions, UseTaggedResult } from './useTagged.types';

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

  // selectCurrentUserPubky() throws an error when user is not authenticated;
  // access currentUserPubky directly to get null instead (e.g., during logout or unauthenticated views)
  const currentUserId = useAuthStore((state) => state.currentUserPubky);
  const viewerId = customViewerId ?? currentUserId;

  // Track zero-tagger tags with their original index for order preservation
  const [zeroTaggerTags, setZeroTaggerTags] = useState<Map<string, { tag: NexusTag; index: number }>>(new Map());

  // Track the order of tags as they were originally loaded
  const [tagOrder, setTagOrder] = useState<Map<string, number>>(new Map());

  // Only fetch stats if enabled
  const { stats, isLoading: isLoadingStats } = useProfileStats(enableStats ? (userId ?? '') : '');

  const {
    record,
    isLoading: isLoadingTags,
    isLoadingMore,
    loadMore: loadNextPage,
  } = useTagCache('user', userId, viewerId);
  const localTags = record?.tags;
  const viewRevision = useRef(0);

  useEffect(() => {
    viewRevision.current += 1;
    setZeroTaggerTags(new Map());
    setTagOrder(new Map());
    return () => {
      viewRevision.current += 1;
    };
  }, [userId, viewerId]);

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

  // Combine local tags with zero-tagger tags, preserving order
  const allTags = useMemo(() => {
    const baseTags = localTags ?? [];
    const baseTagLabels = new Set(baseTags.map((t) => t.label.toLowerCase()));

    // Get zero-tagger tags that aren't in baseTags
    const zeroTagsToAdd: Array<{ tag: NexusTag; index: number }> = [];
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
      const revision = viewRevision.current;
      const label = tagString.trim();

      if (!label) return { success: false, error: 'Tag label cannot be empty' };
      if (!userId) return { success: false, error: 'User ID is required' };
      if (!viewerId) return { success: false, error: 'You must be logged in to add tags' };

      // Check if user already tagged
      const existingTag = allTags.find((t) => t.label.toLowerCase() === label.toLowerCase());
      if (existingTag?.relationship) {
        return { success: false, error: 'You have already added this tag' };
      }

      try {
        // TagController.commitCreate updates IndexedDB first and rolls back on homeserver failure.
        // useLiveQuery will automatically react to the local change or rollback.
        await TagController.commitCreate({
          taggedId: userId as Pubky,
          label,
          taggerId: viewerId,
          taggedKind: TagKind.USER,
        });

        if (viewRevision.current !== revision) return { success: false };

        // Remove from zero-tagger list if it was there
        const labelLower = label.toLowerCase();
        setZeroTaggerTags((prev) => {
          const next = new Map(prev);
          next.delete(labelLower);
          return next;
        });

        toast({
          title: 'Tag added',
        });
        return { success: true };
      } catch {
        if (viewRevision.current !== revision) return { success: false };
        toast({
          variant: 'error',
          description: 'Could not add tag',
        });
        return { success: false, error: 'Failed to add tag' };
      }
    },
    [userId, viewerId, allTags],
  );

  const handleTagToggle = useCallback(
    async (tag: { label: string; relationship?: boolean }): Promise<void> => {
      const revision = viewRevision.current;
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
          taggedId: userId as Pubky,
          label: tag.label,
          taggerId: viewerId,
          taggedKind: TagKind.USER,
        };
        if (userIsTagger) {
          // Track zero-tagger tag BEFORE delete to preserve order
          if (currentTag && (currentTag.taggers_count ?? 0) <= 1) {
            const originalIndex = tagOrder.get(labelLower) ?? currentTagIndex;
            const zeroTag: NexusTag = {
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
          await TagController.commitDelete(params);

          if (viewRevision.current !== revision) return;

          toast({
            title: 'Tag removed',
          });
        } else {
          // TagController.commitCreate updates IndexedDB first and rolls back on homeserver failure.
          await TagController.commitCreate(params);

          if (viewRevision.current !== revision) return;

          // Remove from zero-tagger list
          setZeroTaggerTags((prev) => {
            const next = new Map(prev);
            next.delete(labelLower);
            return next;
          });

          toast({
            title: 'Tag added',
          });
        }
      } catch {
        if (viewRevision.current !== revision) return;
        // Rollback zero-tagger state on error
        if (userIsTagger) {
          setZeroTaggerTags((prev) => {
            const next = new Map(prev);
            next.delete(labelLower);
            return next;
          });
        }
        toast({
          variant: 'error',
          description: userIsTagger ? 'Could not remove tag' : 'Could not add tag',
        });
      }
    },
    [userId, viewerId, allTags, tagOrder],
  );

  const hasMore =
    enablePagination && !!record && !record.cache?.exhausted && (localTags?.length ?? 0) < stats.uniqueTags;

  async function loadMore() {
    if (hasMore) await loadNextPage();
  }

  const isLoading = isLoadingTags || (enableStats && isLoadingStats);

  const tagsWithAvatars = useMemo(() => transformTagsForViewer(allTags, viewerId), [allTags, viewerId]);

  return {
    tags: tagsWithAvatars,
    count: enableStats ? stats.uniqueTags : 0,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    handleTagAdd,
    handleTagToggle,
  };
}
