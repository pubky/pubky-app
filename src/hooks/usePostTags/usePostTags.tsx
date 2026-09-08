'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { TagKind } from '@/application/tag/tag.types';
import { PostController } from '@/controllers/post/post';
import { TagController } from '@/controllers/tag/tag';
import { useTagCache } from '@/hooks/useTagCache/useTagCache';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import { transformTagsForViewer } from '@/molecules/TaggedItem/TaggedItem.utils';
import { toast } from '@/molecules/Toaster/toast';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { UsePostTagsOptions, UsePostTagsResult } from './usePostTags.types';

const EMPTY_TAGS: NexusTag[] = [];

/**
 * Hook for fetching and managing post tags with pagination.
 * Uses useLiveQuery with PostController for automatic reactivity.
 *
 * Mount fills missing data only. Visible entities are refreshed by the TTL coordinator.
 *
 * The TagController.commitCreate/commitDelete methods use local-first writes with
 * compensation rollback, so useLiveQuery reacts immediately and failed homeserver
 * writes are reverted back out of IndexedDB.
 */
export function usePostTags(postId: string | null | undefined, options: UsePostTagsOptions = {}): UsePostTagsResult {
  const { viewerId: customViewerId } = options;

  // selectCurrentUserPubky() throws an error when user is not authenticated;
  // access currentUserPubky directly to get null instead (unauthenticated views should still render tags)
  const currentUserId = useAuthStore((state) => state.currentUserPubky);
  const viewerId = customViewerId ?? currentUserId;

  const { record, isLoading, isLoadingMore, loadMore: loadNextPage } = useTagCache('post', postId, viewerId);

  // Track zero-tagger tags with their original index for order preservation
  const [zeroTaggerTags, setZeroTaggerTags] = useState<Map<string, { tag: NexusTag; index: number }>>(new Map());

  // Track the order of tags as they were originally loaded
  const [tagOrder, setTagOrder] = useState<Map<string, number>>(new Map());

  // In-memory-only: labels the viewer just added are pinned to the front of the list.
  const [recentlyAddedLabels, setRecentlyAddedLabels] = useState<Map<string, number>>(new Map());
  const addCounterRef = useRef(0);
  const viewRevision = useRef(0);

  // Local presentation state belongs to one post and viewer.
  useEffect(() => {
    viewRevision.current += 1;
    setZeroTaggerTags(new Map());
    setTagOrder(new Map());
    setRecentlyAddedLabels(new Map());
    addCounterRef.current = 0;
    return () => {
      viewRevision.current += 1;
    };
  }, [postId, viewerId]);

  // Fetch post counts to derive hasMore from unique_tags count.
  // This avoids defaulting hasMore to true and triggering unnecessary loadMore calls.
  const postCounts = useLiveQuery(
    async () => {
      if (!postId) return null;
      try {
        return await PostController.getCounts({ compositeId: postId });
      } catch (error) {
        if (!isAppError(error)) Logger.warn('Could not read local post counts', { error });
        return null;
      }
    },
    [postId],
    undefined,
  );

  const localTags = record?.tags ?? EMPTY_TAGS;
  const hasMore = !!record && !record.cache?.exhausted && !!postCounts && localTags.length < postCounts.unique_tags;

  // Update tag order map when localTags change (only for new tags)
  useEffect(() => {
    if (localTags.length === 0) return;

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
    const baseTags = localTags;
    const baseTagLabels = new Set(baseTags.map((t) => t.label.toLowerCase()));

    // Get zero-tagger tags that aren't in baseTags
    const zeroTagsToAdd: Array<{ tag: NexusTag; index: number }> = [];
    zeroTaggerTags.forEach((value, label) => {
      if (!baseTagLabels.has(label)) {
        zeroTagsToAdd.push(value);
      }
    });

    // Only applied to baseTags: recently-added-by-viewer labels added to the front
    // (negative sort index, latest first); everything else keeps its original `tagOrder`.
    // Zero-tagger tags keep their own stored index instead.
    const computeSortIndex = (label: string): number => {
      const lower = label.toLowerCase();
      const recentCounter = recentlyAddedLabels.get(lower);
      if (recentCounter !== undefined) return -recentCounter;
      return tagOrder.get(lower) ?? Infinity;
    };

    if (zeroTagsToAdd.length === 0 && recentlyAddedLabels.size === 0) {
      return baseTags;
    }

    const allTagsWithIndex = [
      ...baseTags.map((tag) => ({
        tag,
        index: computeSortIndex(tag.label),
      })),
      ...zeroTagsToAdd,
    ];

    allTagsWithIndex.sort((a, b) => a.index - b.index);

    return allTagsWithIndex.map((item) => item.tag);
  }, [localTags, zeroTaggerTags, tagOrder, recentlyAddedLabels]);

  // Transform tags with avatar data and relationship status
  const tagsWithAvatars = useMemo(() => transformTagsForViewer(allTags, viewerId), [allTags, viewerId]);

  async function loadMore() {
    if (hasMore) await loadNextPage();
  }

  const handleTagAdd = useCallback(
    async (tagString: string): Promise<{ success: boolean; error?: string }> => {
      const revision = viewRevision.current;
      const label = tagString.trim();

      if (!label) return { success: false, error: 'Tag label cannot be empty' };
      if (!postId) return { success: false, error: 'Post ID is required' };
      if (!viewerId) return { success: false, error: 'You must be logged in to add tags' };

      // Check if user already tagged
      const existingTag = allTags.find((t) => t.label.toLowerCase() === label.toLowerCase());
      if (existingTag?.relationship) {
        return { success: false, error: 'You have already added this tag' };
      }

      try {
        await TagController.commitCreate({
          taggedId: postId,
          label,
          taggerId: viewerId,
          taggedKind: TagKind.POST,
        });

        if (viewRevision.current !== revision) return { success: false };

        // Remove from zero-tagger list if it was there
        const labelLower = label.toLowerCase();
        setZeroTaggerTags((prev) => {
          const next = new Map(prev);
          next.delete(labelLower);
          return next;
        });
        addCounterRef.current += 1;
        const counter = addCounterRef.current;
        setRecentlyAddedLabels((prev) => new Map(prev).set(labelLower, counter));

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
    [postId, viewerId, allTags],
  );

  const handleTagToggle = useCallback(
    async (tag: { label: string; relationship?: boolean }): Promise<void> => {
      if (!postId || !viewerId) return;
      const revision = viewRevision.current;

      // Use the relationship from the tag (which comes from transformTagsForViewer)
      // This is more reliable than checking the taggers array which may be truncated
      const currentTagIndex = allTags.findIndex((t) => t.label === tag.label);
      const currentTag = currentTagIndex >= 0 ? allTags[currentTagIndex] : undefined;
      const userIsTagger =
        tag.relationship ?? currentTag?.relationship ?? currentTag?.taggers?.includes(viewerId) ?? false;
      const labelLower = tag.label.toLowerCase();

      try {
        if (userIsTagger) {
          // Track zero-tagger tag BEFORE delete to preserve order
          if (currentTag && (currentTag.taggers_count ?? 0) === 1) {
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

          await TagController.commitDelete({
            taggedId: postId,
            label: tag.label,
            taggerId: viewerId,
            taggedKind: TagKind.POST,
          });

          if (viewRevision.current !== revision) return;
          toast({
            title: 'Tag removed',
          });
          // Removing the tag clears its "recently added" pinning so the natural
          // ordering takes over again if it ever resurfaces.
          setRecentlyAddedLabels((prev) => {
            const next = new Map(prev);
            next.delete(labelLower);
            return next;
          });
        } else {
          await TagController.commitCreate({
            taggedId: postId,
            label: tag.label,
            taggerId: viewerId,
            taggedKind: TagKind.POST,
          });

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
    [postId, viewerId, allTags, tagOrder],
  );

  return {
    tags: tagsWithAvatars,
    count: allTags.length,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    handleTagAdd,
    handleTagToggle,
  };
}
