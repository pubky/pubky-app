import type { ReactNode, RefObject } from 'react';
import { TIMELINE_FEED_VARIANT, type TimelineFeedVariant } from '@/config/feed';

interface TimelineFeedPropsBase {
  /**
   * Variant determines which stream to fetch
   * - 'home': Uses global filters (sort, reach, content)
   * - 'custom': Uses custom filters (sort, reach, layout, content, tags)
   * - 'bookmarks': Uses bookmarks stream with sort/content filters
   * - 'profile': Uses author stream from ProfileContext (all posts except collections)
   * - 'profile_collections': Uses the author's collection posts stream from ProfileContext
   * - 'hot': Uses engagement sorting with reach from hot store
   * - 'search': Uses tags from URL query params with sort/content filters
   * - 'collection': Uses a single collection's item stream from route params
   */
  /**
   * Optional children to render above the timeline (e.g., PostInput)
   * Children can access prependPosts via TimelineFeedContext
   */
  children?: ReactNode;
}

type TimelineFeedPullToRefreshContainerRef = RefObject<HTMLElement | null>;

type BookmarksTimelineFeedProps = TimelineFeedPropsBase & {
  variant: typeof TIMELINE_FEED_VARIANT.BOOKMARKS;
  /**
   * Empty state for finite collection-like feeds.
   */
  emptyState?: ReactNode;
  /**
   * Last grid cell on the bookmarks feed (Add Content CTA for the signed-in user).
   */
  gridTrailingSlot?: ReactNode;
  pullToRefreshContainerRef?: never;
};

type CollectionTimelineFeedProps = TimelineFeedPropsBase & {
  variant: typeof TIMELINE_FEED_VARIANT.COLLECTION;
  /**
   * Empty state for finite collection-like feeds.
   */
  emptyState?: ReactNode;
  /**
   * Last grid cell on the collection feed (owner-only Add Content CTA).
   */
  gridTrailingSlot?: ReactNode;
  /**
   * Optional element that should own pull-to-refresh touch events. Defaults to
   * the feed container.
   */
  pullToRefreshContainerRef?: TimelineFeedPullToRefreshContainerRef;
};

type StandardTimelineFeedProps = TimelineFeedPropsBase & {
  variant: Exclude<
    TimelineFeedVariant,
    typeof TIMELINE_FEED_VARIANT.BOOKMARKS | typeof TIMELINE_FEED_VARIANT.COLLECTION
  >;
  emptyState?: never;
  gridTrailingSlot?: never;
  pullToRefreshContainerRef?: never;
};

export type TimelineFeedProps = BookmarksTimelineFeedProps | CollectionTimelineFeedProps | StandardTimelineFeedProps;

export interface TimelineFeedContextValue {
  /**
   * The variant of the feed providing this context. Lets descendants (e.g. the
   * save picker) tailor behavior to the feed they live in; for example,
   * removing a no-longer-bookmarked post from the grid only on the bookmarks
   * feed.
   */
  variant: TimelineFeedVariant;
  /**
   * Current collection composite id when this context belongs to a single
   * collection feed.
   */
  collectionId?: string;
  /**
   * Add post(s) to the timeline, sorted by timestamp
   * @param postIds - A single post ID or array of post IDs to add
   */
  prependPosts: (postIds: string | string[]) => Promise<void>;
  /**
   * Add post(s) to the top without timestamp sorting.
   * Use for membership-ordered feeds such as bookmarks and single collections.
   */
  prependOptimisticPosts: (postIds: string | string[]) => void;
  /**
   * Remove post(s) from the timeline
   * @param postIds - A single post ID or array of post IDs to remove
   */
  removePosts: (postIds: string | string[]) => void;
}
