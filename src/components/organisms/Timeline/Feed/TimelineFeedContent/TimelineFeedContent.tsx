'use client';

import { useEffect, useRef, useState } from 'react';
import { MuteFilter } from '@/application/stream/posts/muting/mute-filter';
import { Container } from '@/atoms/Container/Container';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { CONTENT_AREA_STACK_CLASS } from '@/config/layoutClasses';
import { NEXUS_STREAM_MAX_LIMIT } from '@/config/nexus';
import { COLLECTION_ITEMS_MAX_COUNT } from '@/config/posts';
import { useApplyPendingFeedInsert } from '@/hooks/useApplyPendingFeedInsert/useApplyPendingFeedInsert';
import { useCollectionStreamMembership } from '@/hooks/useCollectionStreamMembership/useCollectionStreamMembership';
import type { FeedLayoutResolution } from '@/hooks/useFeedLayoutResolution/useFeedLayoutResolution';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import { usePullToRefresh } from '@/hooks/usePullToRefresh/usePullToRefresh';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import { cn } from '@/libs/utils/utils';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import { PullToRefreshIndicator } from '@/molecules/PullToRefreshIndicator/PullToRefreshIndicator';
import { TimelineLoading } from '@/molecules/Timeline/TimelineLoading';
import type { TagsLayout } from '@/organisms/PostMain/PostMain.types';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayoutContext';
import { buildFeedKey } from '@/stores/feedOptimistic/feedOptimistic.types';
import { TimelineCardsPosts } from '../../Posts/CardsPosts/CardsPosts';
import { TimelinePosts } from '../../Posts/Posts';
import { NewPostsSection } from '../NewPostsSection/NewPostsSection';
import type {
  HomeTimelineFeedProps,
  TimelineFeedContextValue,
  TimelineFeedProps,
} from '../TimelineFeed/TimelineFeed.types';
import { TimelineFeedContext } from '../TimelineFeed/TimelineFeedContext';
import { VisualTimelinePosts } from '../TimelineFeed/VisualTimelinePosts';

type TimelineFeedTrailingSlot = Extract<
  TimelineFeedProps,
  { variant: typeof TIMELINE_FEED_VARIANT.BOOKMARKS | typeof TIMELINE_FEED_VARIANT.COLLECTION }
>['trailingSlot'];

type TimelineFeedVisualHiddenItemsNotice = Extract<
  TimelineFeedProps,
  { variant: typeof TIMELINE_FEED_VARIANT.COLLECTION }
>['visualHiddenItemsNotice'];

// A spec-max collection needs ceil(100 / 50) = 2 eager pages after the
// initial load; +1 round of headroom for a trailing empty/filtered page.
const COLLECTION_EAGER_LOAD_MAX_ROUNDS = Math.ceil(COLLECTION_ITEMS_MAX_COUNT / NEXUS_STREAM_MAX_LIMIT) + 1;

interface TimelineFeedContentProps {
  streamId: PostStreamId;
  variant: TimelineFeedProps['variant'];
  tagsLayout: TagsLayout;
  layoutResolution?: FeedLayoutResolution;
  children?: TimelineFeedProps['children'];
  persistentHeader?: HomeTimelineFeedProps['persistentHeader'];
  emptyState?: TimelineFeedProps['emptyState'];
  collectionId?: TimelineFeedContextValue['collectionId'];
  pullToRefreshContainerRef?: TimelineFeedProps['pullToRefreshContainerRef'];
  trailingSlot?: TimelineFeedTrailingSlot;
  visualHiddenItemsNotice?: TimelineFeedVisualHiddenItemsNotice;
  /** Complete local collection membership in collection order; undefined while its local read resolves. */
  membershipPostIds?: string[];
}

interface TimelineFeedWithStreamProps {
  streamId: PostStreamId | undefined;
  variant: TimelineFeedProps['variant'];
  tagsLayout: TagsLayout;
  layoutResolution?: FeedLayoutResolution;
  children?: TimelineFeedProps['children'];
  persistentHeader?: HomeTimelineFeedProps['persistentHeader'];
  emptyState?: TimelineFeedProps['emptyState'];
  collectionId?: TimelineFeedContextValue['collectionId'];
  pullToRefreshContainerRef?: TimelineFeedProps['pullToRefreshContainerRef'];
  trailingSlot?: TimelineFeedTrailingSlot;
  visualHiddenItemsNotice?: TimelineFeedVisualHiddenItemsNotice;
  membershipPostIds?: TimelineFeedContentProps['membershipPostIds'];
}

/**
 * TimelineFeedWithStream
 *
 * Guard component that shows a loading state until the streamId is resolved,
 * then delegates to TimelineFeedContent.
 */
export function TimelineFeedWithStream({
  streamId,
  variant,
  tagsLayout,
  layoutResolution,
  children,
  persistentHeader,
  emptyState,
  collectionId,
  pullToRefreshContainerRef,
  trailingSlot,
  visualHiddenItemsNotice,
  membershipPostIds,
}: TimelineFeedWithStreamProps) {
  if (!streamId) {
    return <TimelineLoading />;
  }

  return (
    <TimelineFeedContent
      streamId={streamId}
      variant={variant}
      tagsLayout={tagsLayout}
      layoutResolution={layoutResolution}
      emptyState={emptyState}
      collectionId={collectionId}
      pullToRefreshContainerRef={pullToRefreshContainerRef}
      trailingSlot={trailingSlot}
      persistentHeader={persistentHeader}
      visualHiddenItemsNotice={visualHiddenItemsNotice}
      membershipPostIds={membershipPostIds}
    >
      {children}
    </TimelineFeedContent>
  );
}

/**
 * TimelineFeedContent
 *
 * Primary component that manages stream pagination, muting, pull-to-refresh,
 * and provides the TimelineFeedContext to children.
 *
 * The outermost Atoms.Container is the default pull-to-refresh touch scope.
 * Some pages can pass an external scope (for example, the collection page wraps
 * hero + items so pulling from the hero refreshes the collection feed too). It
 * shares CONTENT_AREA_STACK_CLASS with ContentLayout's main content area to
 * preserve the same flex-col spacing that children previously inherited as
 * direct descendants of that container.
 */
function TimelineFeedContent({
  streamId,
  variant,
  tagsLayout,
  layoutResolution,
  children,
  persistentHeader,
  emptyState,
  collectionId,
  pullToRefreshContainerRef,
  trailingSlot,
  visualHiddenItemsNotice,
  membershipPostIds,
}: TimelineFeedContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const refreshContainerRef = pullToRefreshContainerRef ?? containerRef;
  const previousMutedUserIdSetRef = useRef<Set<string> | null>(null);

  const isVisualActive = layoutResolution?.isVisualActive ?? false;
  const isCardsActive = layoutResolution?.isCardsActive ?? false;
  const isCollectionFeed = variant === TIMELINE_FEED_VARIANT.COLLECTION;
  const { mutedUserIdSet, isLoading: mutedUsersLoading } = useMutedUsers();
  const stream = useStreamPagination({
    streamId,
    // Collections are finite (≤100 items per envelope spec) — fetch at the
    // Nexus max page size so the eager full load below takes ≤2 requests.
    ...(isCollectionFeed ? { limit: NEXUS_STREAM_MAX_LIMIT } : {}),
  });
  const {
    loading: streamLoading,
    loadingMore: streamLoadingMore,
    hasMore: streamHasMore,
    loadMore: streamLoadMore,
  } = stream;

  // Keep eagerly hydrating the bounded collection stream in batches. Membership
  // and ordering already come from the local envelope; these pages fill the
  // referenced post records and maintain Nexus pagination independently.
  // A fetch error sets hasMore=false, which stops the eager loop.
  // The rounds cap is a defensive bound in case the backend ever misreports
  // `reachedEnd` — if it trips, the feed degrades to normal scroll-to-load
  // (the infinite-scroll sentinel stays active while hasMore is true) and the
  // members it never hydrated fall back to their own cards.
  const eagerLoadRoundsRef = useRef(0);
  const [eagerLoadExhausted, setEagerLoadExhausted] = useState(false);
  useEffect(() => {
    // A fresh initial load (mount or pull-to-refresh) restarts
    // the stream from page one, so the eager budget resets with it.
    if (streamLoading) {
      eagerLoadRoundsRef.current = 0;
      setEagerLoadExhausted(false);
    }
  }, [streamLoading]);
  useEffect(() => {
    if (!isCollectionFeed || streamLoading || streamLoadingMore || !streamHasMore) return;
    if (eagerLoadRoundsRef.current >= COLLECTION_EAGER_LOAD_MAX_ROUNDS) {
      setEagerLoadExhausted(true);
      return;
    }
    eagerLoadRoundsRef.current += 1;
    void streamLoadMore();
  }, [isCollectionFeed, streamLoading, streamLoadingMore, streamHasMore, streamLoadMore]);

  const {
    postIds: rawPostIds,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
    prependPosts,
    prependOptimisticPosts,
    removePosts,
    removePostsOptimistically,
    retainPost,
    displayLoading: feedDisplayLoading,
    isHydrating,
  } = useCollectionStreamMembership({
    enabled: isCollectionFeed,
    streamId,
    collectionId,
    membershipPostIds,
    pagination: stream,
    hydrationCapped: eagerLoadExhausted,
  });

  const orderedPostIds = [...new Set(rawPostIds)];
  // Membership supplies the complete local list. Muting remains a display filter,
  // so unmuting restores members without treating a mute as an explicit removal.
  const postIds = isCollectionFeed
    ? mutedUsersLoading
      ? []
      : MuteFilter.filterPostsSafe(orderedPostIds, mutedUserIdSet)
    : orderedPostIds;
  const displayLoading = feedDisplayLoading || (isCollectionFeed && mutedUsersLoading);
  // A collection can show its membership while its stream still loads. Until the
  // stream settles the feed stays in its loading-more state, which keeps
  // scroll-to-load disarmed, so no page request races the initial or eager loads.
  const isLoadingMore = loadingMore || isHydrating;

  // Drain optimistic posts the global FAB enqueued for this feed. The FAB lives
  // outside this feed's React tree, so it cannot call `prependOptimisticPosts`
  // directly — the `feedOptimistic` store bridges the gap. Only the finite,
  // membership-ordered feeds (single collection + bookmarks) participate.
  const optimisticFeedKey =
    variant === TIMELINE_FEED_VARIANT.COLLECTION && collectionId
      ? buildFeedKey({ type: 'collection', collectionId })
      : variant === TIMELINE_FEED_VARIANT.BOOKMARKS
        ? buildFeedKey({ type: 'bookmarks' })
        : undefined;
  useApplyPendingFeedInsert(optimisticFeedKey, prependOptimisticPosts);

  const enablePullToRefresh =
    variant === TIMELINE_FEED_VARIANT.HOME ||
    variant === TIMELINE_FEED_VARIANT.CUSTOM ||
    variant === TIMELINE_FEED_VARIANT.HOT ||
    variant === TIMELINE_FEED_VARIANT.COLLECTION;
  const { state: pullState, pullDistance } = usePullToRefresh({
    containerRef: refreshContainerRef,
    onRefresh: refresh,
    disabled: !enablePullToRefresh,
  });

  useEffect(() => {
    const previousMutedUserIdSet = previousMutedUserIdSetRef.current;
    const currentMutedUserIdSet = new Set(mutedUserIdSet);
    // Store the latest set before early returns so Strict Mode reruns do not retrigger the same transition.
    previousMutedUserIdSetRef.current = currentMutedUserIdSet;

    if (
      isCollectionFeed ||
      variant === TIMELINE_FEED_VARIANT.PROFILE ||
      variant === TIMELINE_FEED_VARIANT.PROFILE_COLLECTIONS ||
      variant === TIMELINE_FEED_VARIANT.BOOKMARKS
    ) {
      return;
    }

    const hasUnmutedUser = previousMutedUserIdSet
      ? [...previousMutedUserIdSet].some((userId) => !currentMutedUserIdSet.has(userId))
      : false;

    if (hasUnmutedUser) {
      // Unmute can make posts that were removed from pagination state visible again; rebuild from the stream.
      void refresh();
      return;
    }

    if (currentMutedUserIdSet.size === 0) return;

    // Muting only needs to remove currently visible posts, so keep this path cheaper than a full refresh.
    const postIdsToRemove = rawPostIds.filter((id) => MuteFilter.isPostMuted(id, currentMutedUserIdSet));

    if (postIdsToRemove.length > 0) {
      removePosts(postIdsToRemove);
    }
  }, [mutedUserIdSet, rawPostIds, refresh, removePosts, variant, isCollectionFeed]);

  const contextValue: TimelineFeedContextValue = {
    variant,
    collectionId,
    streamId,
    prependPosts,
    prependOptimisticPosts,
    removePosts,
    removePostsOptimistically,
    retainPost,
    collectionMembershipPostIds: membershipPostIds,
  };
  const showEndMessage = variant !== TIMELINE_FEED_VARIANT.COLLECTION && variant !== TIMELINE_FEED_VARIANT.BOOKMARKS;
  // `children` is the composer/filter region on interactive feeds (hidden by the
  // immersive Visual mosaic on Home/Search/Custom) but the collection hero on
  // COLLECTION, which must stay visible in every layout.
  const shouldRenderChildren = !isVisualActive || variant === TIMELINE_FEED_VARIANT.COLLECTION;

  return (
    <TimelineFeedContext.Provider value={contextValue}>
      <PostMainLayoutProvider tagsLayout={tagsLayout}>
        <Container
          ref={containerRef}
          className={cn(CONTENT_AREA_STACK_CLASS, variant === TIMELINE_FEED_VARIANT.COLLECTION && 'gap-6')}
        >
          {enablePullToRefresh && <PullToRefreshIndicator state={pullState} pullDistance={pullDistance} />}
          {shouldRenderChildren ? children : null}
          {persistentHeader}
          <NewPostsSection
            streamId={streamId}
            variant={variant}
            postIds={postIds}
            mutedUserIdSet={mutedUserIdSet}
            mutedUsersLoading={mutedUsersLoading}
            loading={displayLoading}
            prependPosts={prependPosts}
          />
          {isCardsActive ? (
            <TimelineCardsPosts
              postIds={postIds}
              loading={displayLoading}
              loadingMore={isLoadingMore}
              error={error}
              hasMore={hasMore}
              loadMore={loadMore}
              showEndMessage={showEndMessage}
              emptyState={emptyState}
              trailingSlot={trailingSlot}
            />
          ) : isVisualActive ? (
            <VisualTimelinePosts
              postIds={postIds}
              loading={displayLoading}
              loadingMore={isLoadingMore}
              error={error}
              hasMore={hasMore}
              loadMore={loadMore}
              emptyState={emptyState}
              trailingSlot={trailingSlot}
              hiddenItemsNotice={visualHiddenItemsNotice}
              showEndMessage={showEndMessage}
              showUnavailablePosts={variant === TIMELINE_FEED_VARIANT.COLLECTION}
            />
          ) : (
            <TimelinePosts
              postIds={postIds}
              loading={displayLoading}
              loadingMore={isLoadingMore}
              error={error}
              hasMore={hasMore}
              loadMore={loadMore}
              emptyState={emptyState}
              trailingSlot={trailingSlot}
              showEndMessage={showEndMessage}
            />
          )}
        </Container>
      </PostMainLayoutProvider>
    </TimelineFeedContext.Provider>
  );
}
