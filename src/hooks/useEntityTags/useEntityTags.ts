'use client';

import { useCallback, useMemo } from 'react';
import { TagKind } from '@/application/tag/tag.types';
import { usePostTags } from '@/hooks/usePostTags/usePostTags';
import { useTagged } from '@/hooks/useTagged/useTagged';
import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { UseEntityTagsOptions, UseEntityTagsResult } from './useEntityTags.types';

/**
 * Unified hook for fetching and managing entity tags (USER or POST).
 * Automatically selects the appropriate underlying hook based on taggedKind.
 *
 * @param entityId - The ID of the tagged entity (userId or postId)
 * @param taggedKind - The kind of entity (USER or POST)
 * @param options - Configuration options
 * @returns Tag data and handlers
 *
 * @example
 * ```tsx
 * // For user tags
 * const { tags, handleTagToggle } = useEntityTags(userId, TagKind.USER);
 *
 * // For post tags
 * const { tags, handleTagToggle } = useEntityTags(postId, TagKind.POST);
 * ```
 */
export function useEntityTags(
  entityId: string | null | undefined,
  taggedKind: TagKind,
  options: UseEntityTagsOptions = {},
): UseEntityTagsResult {
  const { viewerId: customViewerId, providedTags } = options;

  // selectCurrentUserPubky() throws an error when user is not authenticated;
  // access currentUserPubky directly to get null instead (unauthenticated views should still render tags)
  const currentUserId = useAuthStore((state) => state.currentUserPubky);
  const viewerId = customViewerId ?? currentUserId;

  // Use the appropriate hook based on kind
  const userTagsResult = useTagged(taggedKind === TagKind.USER ? entityId : null, {
    viewerId: customViewerId,
    enablePagination: false,
    enableStats: false,
  });

  const postTagsResult = usePostTags(taggedKind === TagKind.POST ? entityId : null, {
    viewerId: customViewerId,
  });

  // Select the active result based on kind
  const activeResult = taggedKind === TagKind.USER ? userTagsResult : postTagsResult;

  // Transform provided NexusTag[] to TagWithAvatars[] if needed
  const transformedProvidedTags = useMemo((): TagWithAvatars[] | null => {
    if (!providedTags) return null;
    return providedTags.map((tag) => ({
      ...tag,
      taggers: (tag.taggers ?? []).map((id) => ({ id, avatarUrl: '' })),
    }));
  }, [providedTags]);

  // Use provided tags if available, otherwise use fetched tags
  const tags = useMemo(() => {
    if (transformedProvidedTags) return transformedProvidedTags;
    return activeResult.tags;
  }, [transformedProvidedTags, activeResult.tags]);

  // Helper to check if viewer is a tagger
  const isViewerTagger = useCallback(
    (tag: TagWithAvatars): boolean => {
      if (!viewerId) return false;
      // Check relationship first, then check taggers array
      if (tag.relationship !== undefined) return tag.relationship;
      return tag.taggers?.some((tagger) => tagger.id === viewerId) ?? false;
    },
    [viewerId],
  );

  // Wrap handleTagToggle to work with TagWithAvatars directly
  const handleTagToggle = useCallback(
    async (tag: TagWithAvatars): Promise<void> => {
      await activeResult.handleTagToggle({
        label: tag.label,
        relationship: isViewerTagger(tag),
      });
    },
    [activeResult, isViewerTagger],
  );

  return {
    tags,
    count: activeResult.count,
    isLoading: activeResult.isLoading,
    isViewerTagger,
    handleTagToggle,
    handleTagAdd: activeResult.handleTagAdd,
  };
}
