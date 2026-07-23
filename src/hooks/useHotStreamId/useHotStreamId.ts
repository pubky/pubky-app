import type { AuthorStreamCompositeId, PostStreamId } from '@/models/stream/post/postStream.types';
import { StreamSource } from '@/services/nexus/stream/posts/postStream.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { CONTENT, REACH, SORT } from '@/stores/home/home.types';
import { getStreamId } from '@/stores/home/home.utils';
import { useHotStore } from '@/stores/hot/hot.store';

/**
 * useHotStreamId
 *
 * Hook that returns the stream ID for hot/trending posts based on the hot store's reach filter.
 * Standard reaches use engagement sorting and all content types. ME reuses the
 * current user's author/profile stream; NETWORK resolves through the ALL mapping.
 *
 * @returns The stream ID for trending posts
 *
 * @example
 * ```tsx
 * const streamId = useHotStreamId();
 * // Returns PostStreamTypes.POPULARITY_ALL_ALL when reach is 'all'
 * // Returns PostStreamTypes.POPULARITY_FOLLOWING_ALL when reach is 'following'
 * // Returns PostStreamTypes.POPULARITY_FRIENDS_ALL when reach is 'friends'
 * ```
 */
export function useHotStreamId(): PostStreamId {
  const reach = useHotStore((state) => state.reach);
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);

  if (reach === REACH.ME && currentUserPubky) {
    return `${StreamSource.AUTHOR}:${currentUserPubky}` as AuthorStreamCompositeId;
  }

  const effectiveReach = currentUserPubky || reach === REACH.NETWORK ? reach : REACH.ALL;

  // Hot/Trending posts use engagement sorting (POPULARITY)
  // Content is always 'all' for hot posts
  return getStreamId(SORT.ENGAGEMENT, effectiveReach, CONTENT.ALL);
}
