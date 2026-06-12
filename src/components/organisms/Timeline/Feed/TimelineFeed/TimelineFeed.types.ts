import type { ReactNode } from 'react';
import type { TimelineFeedVariant } from '@/config/feed';

export interface TimelineFeedProps {
  /**
   * Variant determines which stream to fetch
   * - 'home': Uses global filters (sort, reach, content)
   * - 'custom': Uses custom filters (sort, reach, layout, content, tags)
   * - 'bookmarks': Uses bookmarks stream with sort/content filters
   * - 'profile': Uses author stream from ProfileContext
   * - 'hot': Uses engagement sorting with reach from hot store
   * - 'search': Uses tags from URL query params with sort/content filters
   * - 'collection': Uses a single collection's item stream from route params
   */
  variant: TimelineFeedVariant;
  /**
   * Optional children to render above the timeline (e.g., PostInput)
   * Children can access prependPosts via TimelineFeedContext
   */
  children?: ReactNode;
  /**
   * Optional custom empty state for feed variants that forward one. Currently
   * used by bookmarks to replace the default "No posts found" copy while keeping
   * emptiness driven by the resolved bookmarks stream.
   */
  emptyState?: ReactNode;
}

export interface TimelineFeedContextValue {
  /**
   * The variant of the feed providing this context. Lets descendants (e.g. the
   * save picker) tailor behavior to the feed they live in; for example,
   * removing a no-longer-bookmarked post from the grid only on the bookmarks
   * feed.
   */
  variant: TimelineFeedVariant;
  /**
   * Add post(s) to the timeline, sorted by timestamp
   * @param postIds - A single post ID or array of post IDs to add
   */
  prependPosts: (postIds: string | string[]) => Promise<void>;
  /**
   * Remove post(s) from the timeline
   * @param postIds - A single post ID or array of post IDs to remove
   */
  removePosts: (postIds: string | string[]) => void;
}
