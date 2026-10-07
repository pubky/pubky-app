'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { PostController } from '@/controllers/post/post';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import { Logger } from '@/libs/logger/logger';
import { postKindBelongsToStream } from '@/stores/home/home.utils';
import type { UseUnreadPostsOptions, UseUnreadPostsResult } from './useUnreadPosts.types';

/**
 * useUnreadPosts
 *
 * Hook to reactively watch unread posts for a specific stream.
 * Uses Dexie's useLiveQuery to automatically re-render when the
 * unread_post_streams or post_details tables are updated by the StreamCoordinator.
 *
 * @param options - Options containing the streamId to watch
 * @returns Object with unreadPostIds array and unreadCount
 *
 * @example
 * ```tsx
 * const { unreadPostIds, unreadCount } = useUnreadPosts({ streamId });
 *
 * if (unreadCount > 0) {
 *   // Show "X new posts" button
 * }
 * ```
 */
export function useUnreadPosts({ streamId }: UseUnreadPostsOptions): UseUnreadPostsResult {
  const unreadStream = useLiveQuery(async () => {
    try {
      if (!streamId) return null;
      const stream = await StreamPostsController.getUnreadStream({ streamId });
      if (!stream) return null;
      // Unread IDs can arrive before the coordinator hydrates their details.
      // Wait for local data so a collection or tombstone never inflates the count.
      const details = await PostController.getDetailsByIds({ compositeIds: stream.stream });
      const readyPostIds = stream.stream.filter((_id, index) => {
        const detail = details[index];
        return detail !== undefined && postKindBelongsToStream(detail.kind, streamId);
      });
      const filteredStream = await StreamPostsController.filterStreamPosts({ streamId, postIds: readyPostIds });
      return { streamId, stream: filteredStream };
    } catch (error) {
      Logger.error('[useUnreadPosts] Failed to query unread stream', { streamId, error });
      return null;
    }
  }, [streamId]);

  // useLiveQuery retains its previous result while a new dependency is loading.
  const unreadPostIds = unreadStream?.streamId === streamId ? unreadStream.stream : [];
  return { unreadPostIds, unreadCount: unreadPostIds.length };
}
