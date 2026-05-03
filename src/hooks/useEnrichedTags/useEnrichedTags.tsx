'use client';

import { useBulkUserAvatars } from '@/hooks/useBulkUserAvatars/useBulkUserAvatars';
import type { Pubky } from '@/models/models.types';
import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';
import type { UseEnrichedTagsResult } from './useEnrichedTags.types';

/**
 * Hook to enrich tags with user details for tagger avatars.
 * Fetches user names and avatar URLs for all taggers in the provided tags.
 *
 * @param tags - Array of tags with taggers to enrich
 * @returns Enriched tags with proper user names and avatar URLs
 *
 * @example
 * ```tsx
 * const { tags } = useEntityTags(entityId, tagKind);
 * const { enrichedTags } = useEnrichedTags(tags);
 * // enrichedTags now have proper names for avatar fallbacks
 * ```
 */
export function useEnrichedTags(tags: TagWithAvatars[]): UseEnrichedTagsResult {
  // Collect all unique tagger IDs for bulk user details lookup
  const allTaggerIds = (() => {
    const ids = new Set<Pubky>();
    for (const tag of tags) {
      for (const tagger of tag.taggers) {
        ids.add(tagger.id);
      }
    }
    return Array.from(ids);
  })();

  // Get user details (name, avatarUrl) for all taggers
  const { usersMap, isLoading } = useBulkUserAvatars(allTaggerIds);

  // Enrich tags with user details for proper avatar fallbacks
  const enrichedTags = tags.map((tag) => ({
    ...tag,
    taggers: tag.taggers.map((tagger) => {
      const userDetails = usersMap.get(tagger.id);
      return {
        ...tagger,
        name: userDetails?.name ?? tagger.name,
        // During loading: use existing avatarUrl (prevents flash for users with avatars)
        // After loading: use verified avatarUrl (undefined if user has no avatar)
        avatarUrl: isLoading ? tagger.avatarUrl : userDetails?.avatarUrl,
      };
    }),
  }));

  return { enrichedTags, isLoading };
}
