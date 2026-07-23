import type { AuthorStreamCompositeId, PostStreamId } from '@/models/stream/post/postStream.types';
import { StreamSource } from '@/services/nexus/stream/posts/postStream.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useHomeStore } from '@/stores/home/home.store';
import { type ContentType, REACH } from '@/stores/home/home.types';
import { getHomeStreamIdFromFilters } from '@/stores/home/home.utils';

/**
 * Custom hook that returns the current streamId based on global filter state
 *
 * This hook reads the current filter state from the filters store and
 * generates the appropriate streamId following the pattern: sorting:source:kind
 *
 * Standard reaches map to Nexus post streams. ME reuses the existing
 * author/profile stream, while NETWORK resolves through the WoT stream.
 *
 * @returns The current post stream ID
 *
 * @example
 * ```tsx
 * function Timeline() {
 *   const streamId = useStreamIdFromFilters();
 *   // streamId will be PostStreamTypes.TIMELINE_ALL_ALL by default
 *   // or PostStreamTypes.POPULARITY_FOLLOWING_IMAGE if filters are changed
 *
 *   const { data } = useQuery({
 *     queryKey: ['posts', streamId],
 *     queryFn: () => fetchPosts(streamId),
 *   });
 * }
 * ```
 */
export function useStreamIdFromFilters(contentOverride?: ContentType): PostStreamId {
  const sort = useHomeStore((state) => state.sort);
  const reach = useHomeStore((state) => state.reach);
  const content = useHomeStore((state) => state.content);
  const profileTags = useHomeStore((state) => state.profileTags);
  const profileTagScope = useHomeStore((state) => state.profileTagScope);
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const effectiveContent = contentOverride ?? content;

  if (reach === REACH.ME && currentUserPubky) {
    return `${StreamSource.AUTHOR}:${currentUserPubky}` as AuthorStreamCompositeId;
  }

  return getHomeStreamIdFromFilters(sort, reach, effectiveContent, currentUserPubky, profileTags, profileTagScope);
}
