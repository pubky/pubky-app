'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import { Logger } from '@/libs/logger/logger';
import type { UseUnreadPostsOptions, UseUnreadPostsResult } from './useUnreadPosts.types';

/**
 * useUnreadPosts
 *
 * Hook to reactively watch unread posts for a specific stream.
 * Uses Dexie's useLiveQuery to automatically re-render when the
 * unread_post_streams table is updated by the StreamCoordinator.
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
      const filteredStream = await StreamPostsController.filterStreamPosts({ streamId, postIds: stream.stream });
      return { stream: filteredStream };
    } catch (error) {
      Logger.error('[useUnreadPosts] Failed to query unread stream', { streamId, error });
      return null;
    }
  }, [streamId]);

  return {
    unreadPostIds: unreadStream?.stream ?? [],
    unreadCount: unreadStream?.stream?.length ?? 0,
  };
}
