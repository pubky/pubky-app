import type { PostStreamTypes } from '@/models/stream/post/postStream.types';
import { CONTENT, SORT } from '@/stores/home/home.types';
import { getStreamId } from '@/stores/home/home.utils';
import { useHotStore } from '@/stores/hot/hot.store';

/**
 * useHotStreamId
 *
 * Hook that returns the stream ID for hot/trending posts based on the hot store's reach filter.
 * Uses engagement sorting (total_engagement) and all content types.
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
export function useHotStreamId(): PostStreamTypes {
  const reach = useHotStore((state) => state.reach);

  // Hot/Trending posts use engagement sorting (POPULARITY)
  // Content is always 'all' for hot posts
  return getStreamId(SORT.ENGAGEMENT, reach, CONTENT.ALL);
}
