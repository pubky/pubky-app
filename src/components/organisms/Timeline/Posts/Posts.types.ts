import type { TagsLayout } from '../../../organisms/PostMain/PostMain.types';

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
  /**
   * Tags layout for post cards: 'inline' (default toggle) or 'side' (two-column with tags on right)
   */
  tagsLayout?: TagsLayout;
}
