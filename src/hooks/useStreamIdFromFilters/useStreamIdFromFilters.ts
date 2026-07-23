import type { PostStreamId } from '@/models/stream/post/postStream.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useHomeStore } from '@/stores/home/home.store';
import type { ContentType } from '@/stores/home/home.types';
import { getHomeStreamIdFromFilters } from '@/stores/home/home.utils';

/**
 * Custom hook that returns the current streamId based on global filter state
 *
 * This hook reads the current filter state from the filters store and
 * generates the appropriate streamId following the pattern: sorting:source:kind
 *
 * @returns The current streamId
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
export function useStreamIdFromFilters(contentOverride?: ContentType): PostStreamId | undefined {
  const sort = useHomeStore((state) => state.sort);
  const reach = useHomeStore((state) => state.reach);
  const content = useHomeStore((state) => state.content);
  const profileTags = useHomeStore((state) => state.profileTags);
  const taggedAsActive = useHomeStore((state) => state.taggedAsActive);
  const homeHasHydrated = useHomeStore((state) => state.hasHydrated);
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const authHasHydrated = useAuthStore((state) => state.hasHydrated);
  const effectiveContent = contentOverride ?? content;

  if (!homeHasHydrated || !authHasHydrated) {
    return undefined;
  }

  return getHomeStreamIdFromFilters({
    sort,
    reach,
    content: effectiveContent,
    currentUserPubky,
    profileTags,
    taggedAsActive,
  });
}
