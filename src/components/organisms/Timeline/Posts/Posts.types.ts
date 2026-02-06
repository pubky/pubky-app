import type { Pubky } from '@/core';
import { TIMELINE_ITEM_TYPE } from './Posts.constants';

/**
 * A single post item in the timeline (not grouped).
 */
export interface SinglePostItem {
  type: typeof TIMELINE_ITEM_TYPE.SINGLE;
  postId: string;
}

/**
 * A group of plain reposts of the same original post.
 * All reposts in the group share the same original post.
 */
export interface RepostGroup {
  type: typeof TIMELINE_ITEM_TYPE.REPOST_GROUP;
  /** The original post that was reposted */
  originalPostId: string;
  /** IDs of the repost posts (not the original) */
  repostPostIds: string[];
  /** User IDs of the reposters */
  reposterIds: Pubky[];
  /** Earliest timestamp among all reposts in the group (for sorting) */
  earliestTimestamp: number;
  /** Whether the current user has reposted this post */
  includesCurrentUser: boolean;
  /** The current user's repost ID (for undo action) */
  currentUserRepostId?: string;
}

/**
 * A timeline item can be either a single post or a grouped repost.
 */
export type TimelineItem = SinglePostItem | RepostGroup;

export interface TimelinePostsProps {
  /**
   * Post IDs to display
   */
  postIds: string[];
  /**
   * Loading state
   */
  loading: boolean;
  /**
   * Loading more state (for pagination)
   */
  loadingMore: boolean;
  /**
   * Error message if any
   */
  error: string | null;
  /**
   * Whether there are more posts to load
   */
  hasMore: boolean;
  /**
   * Function to load more posts
   */
  loadMore: () => Promise<void>;
}
