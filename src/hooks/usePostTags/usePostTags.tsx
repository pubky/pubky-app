'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslations } from 'next-intl';
import { TagKind } from '@/application/tag/tag.types';
import { PostController } from '@/controllers/post/post';
import { TagController } from '@/controllers/tag/tag';
import { transformTagsForViewer } from '@/molecules/TaggedItem/TaggedItem.utils';
import { toast } from '@/molecules/Toaster/use-toast';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { TAGS_PER_PAGE } from './usePostTags.constants';
import type { UsePostTagsOptions, UsePostTagsResult } from './usePostTags.types';

/**
 * Hook for fetching and managing post tags with pagination.
 * Uses useLiveQuery with PostController for automatic reactivity.
 *
 * On mount, fetches the first page of tags from Nexus and merges into IndexedDB
 * so that tags from other users are visible (not just locally-created ones).
 *
 * The TagController.commitCreate/commitDelete methods use local-first writes with
 * compensation rollback, so useLiveQuery reacts immediately and failed homeserver
 * writes are reverted back out of IndexedDB.
 */
export function usePostTags(postId: string | null | undefined, options: UsePostTagsOptions = {}): UsePostTagsResult {
  const { viewerId: customViewerId } = options;
  const tTags = useTranslations('toast.tags');

  // selectCurrentUserPubky() throws an error when user is not authenticated;
  // access currentUserPubky directly to get null instead (unauthenticated views should still render tags)
  const currentUserId = useAuthStore((state) => state.currentUserPubky);
  const viewerId = customViewerId ?? currentUserId;

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [paginationExhausted, setPaginationExhausted] = useState(false);
  const loadedCountRef = useRef(0);
  const prevPostIdRef = useRef<string | null | undefined>(null);
  const [hasFetched, setHasFetched] = useState(false);

  // Track zero-tagger tags with their original index for order preservation
  const [zeroTaggerTags, setZeroTaggerTags] = useState<Map<string, { tag: NexusTag; index: number }>>(new Map());

  // Track the order of tags as they were originally loaded
  const [tagOrder, setTagOrder] = useState<Map<string, number>>(new Map());

  // Reset state when postId changes
  useEffect(() => {
    if (prevPostIdRef.current !== postId) {
      setPaginationExhausted(false);
      loadedCountRef.current = 0;
      prevPostIdRef.current = postId;
      setZeroTaggerTags(new Map());
      setTagOrder(new Map());
      setHasFetched(false);
    }
  }, [postId]);

  // Fetch tags via PostController - returns TagCollectionModelSchema[] where each has { id, tags: NexusTag[] }
  const tagsCollection = useLiveQuery(
    async () => {
      if (!postId) return null;
      return await PostController.getTags({ compositeId: postId });
    },
    [postId],
    undefined,
  );

  // Fetch post counts to derive hasMore from unique_tags count.
  // This avoids defaulting hasMore to true and triggering unnecessary loadMore calls.
  const postCounts = useLiveQuery(
    async () => {
      if (!postId) return null;
      return await PostController.getCounts({ compositeId: postId });
    },
    [postId],
    undefined,
  );

  // Fetch first page of tags from Nexus on mount to ensure tags from other users are visible.
  // PostApplication.fetchTags merges results into IndexedDB, so useLiveQuery reacts automatically.
  useEffect(() => {
    if (!postId || hasFetched) return;
    let stale = false;

    const fetchInitialTags = async () => {
      try {
        const fetchedTags = await PostController.fetchTags({
          compositeId: postId,
          skip: 0,
          limit: TAGS_PER_PAGE,
          viewerId: viewerId ?? undefined,
        });

        if (stale) return;
        loadedCountRef.current = Math.max(loadedCountRef.current, fetchedTags.length);

        if (fetchedTags.length < TAGS_PER_PAGE) {
          setPaginationExhausted(true);
        }
      } catch {
        // Silently fail — local tags (if any) are still shown via useLiveQuery
      } finally {
        if (!stale) setHasFetched(true);
      }
    };

    fetchInitialTags();
    return () => {
      stale = true;
    };
    // `viewerId` is listed for parity with the user-tags hook (`useTagged`),
    // but the `hasFetched` guard above means a mid-mount viewer change
    // (e.g. user logs in on the same page) will not trigger a re-fetch.
    // This matches existing behaviour and is out of scope for #1721.
    // To support that case in the future, reset `hasFetched` when viewerId
    // changes — see the `prevPostIdRef` pattern below for the shape.
  }, [postId, hasFetched, viewerId]);

  const isLoading = tagsCollection === undefined;

  // Extract NexusTag[] from the collection (first item contains the tags array)
  const localTags = useMemo(() => {
    if (!tagsCollection || tagsCollection.length === 0) return [];
    return tagsCollection[0]?.tags ?? [];
  }, [tagsCollection]);

  // Derive hasMore from the known unique_tags count in IndexedDB rather than
  // defaulting to true. This prevents the sentinel from rendering (and loadMore
  // from firing) when all tags are already cached locally.
  // paginationExhausted acts as a safety valve: if loadMore ever receives fewer
  // than TAGS_PER_PAGE results, pagination is marked exhausted to prevent infinite
  // empty fetches when unique_tags in IndexedDB is stale (e.g. a tag was deleted
  // on the server but the count hasn't refreshed via TTL yet).
  const hasMore = postCounts && !paginationExhausted ? localTags.length < postCounts.unique_tags : false;

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
      const newTags = await PostController.fetchTags({
        compositeId: postId,
        skip,
        limit: TAGS_PER_PAGE,
        viewerId: viewerId ?? undefined,
      });

      // IMPORTANT: Increment by fetched count, not by unique tags in UI.
      // This ensures skip always progresses even if tags are deduplicated during merge.
      loadedCountRef.current += newTags.length;

      if (newTags.length < TAGS_PER_PAGE) {
        setPaginationExhausted(true);
      }
    } catch {
      toast({
        title: tTags('loadFailed'),
        description: tTags('loadFailedDesc'),
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [postId, isLoadingMore, hasMore, viewerId, tTags]);

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
        await TagController.commitCreate({
          taggedId: postId,
          label,
          taggerId: viewerId,
          taggedKind: TagKind.POST,
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
    [postId, viewerId, allTags, tTags],
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

          toast({
            title: tTags('removed'),
            description: tTags('removedDesc', { label: tag.label }),
          });
        } else {
          await TagController.commitCreate({
            taggedId: postId,
            label: tag.label,
            taggerId: viewerId,
            taggedKind: TagKind.POST,
          });

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
    [postId, viewerId, allTags, tagOrder, tTags],
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
