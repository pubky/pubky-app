import type { ReactNode, RefObject } from 'react';
import { TIMELINE_FEED_VARIANT, type TimelineFeedVariant } from '@/config/feed';
import type { OptimisticPostRemoval } from '@/hooks/useStreamPagination/useStreamPagination.types';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import type { LayoutType } from '@/stores/home/home.types';

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

export type HomeTimelineFeedProps = TimelineFeedPropsBase & {
  variant: typeof TIMELINE_FEED_VARIANT.HOME;
  /**
   * Optional header rendered after ordinary children and before timeline
   * content. Unlike children, it stays visible in Visual layout.
   */
  persistentHeader?: ReactNode;
  emptyState?: never;
  trailingSlot?: never;
  pullToRefreshContainerRef?: never;
  requestedLayout?: never;
};

type TimelineFeedPullToRefreshContainerRef = RefObject<HTMLElement | null>;

type BookmarksTimelineFeedProps = TimelineFeedPropsBase & {
  variant: typeof TIMELINE_FEED_VARIANT.BOOKMARKS;
  /**
   * Empty state for finite collection-like feeds.
   */
  emptyState?: ReactNode;
  /** Add Content CTA rendered after bookmarked posts. */
  trailingSlot?: ReactNode;
  pullToRefreshContainerRef?: never;
  requestedLayout?: never;
  visualHiddenItemsNotice?: never;
};

type CollectionTimelineFeedProps = TimelineFeedPropsBase & {
  variant: typeof TIMELINE_FEED_VARIANT.COLLECTION;
  /** Collection-scoped Grid/List/Visual choice; never sourced from the persisted home store. */
  requestedLayout?: LayoutType;
  /**
   * Empty state for finite collection-like feeds.
   */
  emptyState?: ReactNode;
  /** Owner-only Add Content CTA rendered after collection posts. */
  trailingSlot?: ReactNode;
  /**
   * Rendered above the Visual mosaic when the collection contains non-media
   * items the layout hides. Shown to owners and visitors alike; other layouts
   * ignore it.
   */
  visualHiddenItemsNotice?: ReactNode;
  /**
   * Optional element that should own pull-to-refresh touch events. Defaults to
   * the feed container.
   */
  pullToRefreshContainerRef?: TimelineFeedPullToRefreshContainerRef;
};

type StandardTimelineFeedProps = TimelineFeedPropsBase & {
  variant: Exclude<
    TimelineFeedVariant,
    typeof TIMELINE_FEED_VARIANT.HOME | typeof TIMELINE_FEED_VARIANT.BOOKMARKS | typeof TIMELINE_FEED_VARIANT.COLLECTION
  >;
  emptyState?: never;
  trailingSlot?: never;
  pullToRefreshContainerRef?: never;
  requestedLayout?: never;
  visualHiddenItemsNotice?: never;
};

export type TimelineFeedProps =
  | HomeTimelineFeedProps
  | BookmarksTimelineFeedProps
  | CollectionTimelineFeedProps
  | StandardTimelineFeedProps;

export interface TimelineFeedContextValue {
  /**
   * The variant of the feed providing this context. Lets descendants (e.g. the
   * save picker) tailor behavior to the feed they live in; for example,
   * removing a no-longer-bookmarked post from the grid only on the bookmarks
   * feed.
   */
  variant: TimelineFeedVariant;
  /**
   * Active post stream for this feed. Used to gate optimistic inserts so posts
   * that do not match the current content filter are not prepended locally.
   */
  streamId: PostStreamId;
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
   * Permanently remove post(s) from the timeline.
   * @param postIds - A single post ID or array of post IDs to remove
   */
  removePosts: (postIds: string | string[]) => void;
  /**
   * Hide post(s) immediately while persistence is pending.
   * The returned transaction must be committed or rolled back.
   *
   * Optional as a capability flag: consumers (e.g. `useRemoveDeletedPost`)
   * treat its absence as "this surface does not support transactional
   * removal" — unlike `UseStreamPaginationResult`, where it is always present.
   */
  removePostsOptimistically?: (postIds: string | string[]) => OptimisticPostRemoval;
}
