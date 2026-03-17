'use client';

import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as Core from '@/core';
import { toast } from '@/molecules/Toaster/use-toast';
import type { UsePostTagsResult, UsePostTagsOptions } from './usePostTags.types';
import { transformTagsForViewer } from '@/molecules/TaggedItem/TaggedItem.utils';
import { TAGS_PER_PAGE } from './usePostTags.constants';

/**
 * Hook for fetching and managing post tags with pagination.
 * Uses useLiveQuery with PostController for automatic reactivity.
 *
 * The TagController.commitCreate/commitDelete methods use local-first writes with
 * compensation rollback, so useLiveQuery reacts immediately and failed homeserver
 * writes are reverted back out of IndexedDB.
 */
export function usePostTags(postId: string | null | undefined, options: UsePostTagsOptions = {}): UsePostTagsResult {
  const { viewerId: customViewerId } = options;

  // selectCurrentUserPubky() throws an error when user is not authenticated;
  // access currentUserPubky directly to get null instead (unauthenticated views should still render tags)
  const currentUserId = Core.useAuthStore((state) => state.currentUserPubky);
  const viewerId = customViewerId ?? currentUserId;

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loadedCountRef = useRef(0);
  const prevPostIdRef = useRef<string | null | undefined>(null);

  // Track zero-tagger tags with their original index for order preservation
  const [zeroTaggerTags, setZeroTaggerTags] = useState<Map<string, { tag: Core.NexusTag; index: number }>>(new Map());

  // Track the order of tags as they were originally loaded
  const [tagOrder, setTagOrder] = useState<Map<string, number>>(new Map());

  // Reset state when postId changes
  useEffect(() => {
    if (prevPostIdRef.current !== postId) {
      setHasMore(true);
      loadedCountRef.current = 0;
      prevPostIdRef.current = postId;
      setZeroTaggerTags(new Map());
      setTagOrder(new Map());
    }
  }, [postId]);

  // Fetch tags via PostController - returns TagCollectionModelSchema[] where each has { id, tags: NexusTag[] }
  const tagsCollection = useLiveQuery(
    async () => {
      if (!postId) return null;
      return await Core.PostController.getTags({ compositeId: postId });
    },
    [postId],
    undefined,
  );

  const isLoading = tagsCollection === undefined;

  // Extract NexusTag[] from the collection (first item contains the tags array)
  const localTags = useMemo(() => {
    if (!tagsCollection || tagsCollection.length === 0) return [];
    return tagsCollection[0]?.tags ?? [];
  }, [tagsCollection]);

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

  // Initialize loadedCountRef when initial data is available from IndexedDB
  // This ensures skip starts from the correct value on first loadMore call
  useEffect(() => {
    if (!isLoading && loadedCountRef.current === 0 && localTags.length > 0) {
      loadedCountRef.current = localTags.length;
    }
  }, [isLoading, localTags.length]);

  // Transform tags with avatar data and relationship status
  const tagsWithAvatars = useMemo(() => transformTagsForViewer(allTags, viewerId), [allTags, viewerId]);

  // Load more tags from Nexus
  const loadMore = useCallback(async () => {
    if (!postId || isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const skip = loadedCountRef.current;
      const newTags = await Core.PostController.fetchTags({
        compositeId: postId,
        skip,
        limit: TAGS_PER_PAGE,
      });

      // IMPORTANT: Increment by fetched count, not by unique tags in UI.
      // This ensures skip always progresses even if tags are deduplicated during merge.
      loadedCountRef.current += newTags.length;

      if (newTags.length < TAGS_PER_PAGE) {
        setHasMore(false);
      }
    } catch {
      toast({
        title: 'Failed to load more tags',
        description: 'Could not load more tags. Please try again.',
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [postId, isLoadingMore, hasMore]);

  const handleTagAdd = useCallback(
    async (tagString: string): Promise<{ success: boolean; error?: string }> => {
      const label = tagString.trim();

      if (!label) return { success: false, error: 'Tag label cannot be empty' };
      if (!postId) return { success: false, error: 'Post ID is required' };
      if (!viewerId) return { success: false, error: 'You must be logged in to add tags' };

      // Check if user already tagged
      const existingTag = allTags.find((t) => t.label.toLowerCase() === label.toLowerCase());
      if (existingTag?.taggers?.includes(viewerId)) {
        return { success: false, error: 'You have already added this tag' };
      }

      try {
        await Core.TagController.commitCreate({
          taggedId: postId,
          label,
          taggerId: viewerId,
          taggedKind: Core.TagKind.POST,
        });

        // Remove from zero-tagger list if it was there
        const labelLower = label.toLowerCase();
        setZeroTaggerTags((prev) => {
          const next = new Map(prev);
          next.delete(labelLower);
          return next;
        });

        return { success: true };
      } catch {
        toast({
          title: 'Failed to add tag',
          description: `Could not add "${label}". Please try again.`,
        });
        return { success: false, error: 'Failed to add tag' };
      }
    },
    [postId, viewerId, allTags],
  );

  const handleTagToggle = useCallback(
    async (tag: { label: string; relationship?: boolean }): Promise<void> => {
      if (!postId || !viewerId) return;

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

          await Core.TagController.commitDelete({
            taggedId: postId,
            label: tag.label,
            taggerId: viewerId,
            taggedKind: Core.TagKind.POST,
          });
        } else {
          await Core.TagController.commitCreate({
            taggedId: postId,
            label: tag.label,
            taggerId: viewerId,
            taggedKind: Core.TagKind.POST,
          });

          // Remove from zero-tagger list
          setZeroTaggerTags((prev) => {
            const next = new Map(prev);
            next.delete(labelLower);
            return next;
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
          title: userIsTagger ? 'Failed to remove tag' : 'Failed to add tag',
          description: `Could not ${userIsTagger ? 'remove' : 'add'} "${tag.label}". Please try again.`,
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
