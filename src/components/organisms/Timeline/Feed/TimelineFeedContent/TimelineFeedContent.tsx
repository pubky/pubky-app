'use client';

import { useEffect, useRef } from 'react';
import { MuteFilter } from '@/application/stream/posts/muting/mute-filter';
import { Container } from '@/atoms/Container/Container';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { useApplyPendingFeedInsert } from '@/hooks/useApplyPendingFeedInsert/useApplyPendingFeedInsert';
import type { FeedLayoutResolution } from '@/hooks/useFeedLayoutResolution/useFeedLayoutResolution';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import { usePullToRefresh } from '@/hooks/usePullToRefresh/usePullToRefresh';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import { PullToRefreshIndicator } from '@/molecules/PullToRefreshIndicator/PullToRefreshIndicator';
import { TimelineLoading } from '@/molecules/Timeline/TimelineLoading';
import type { TagsLayout } from '@/organisms/PostMain/PostMain.types';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayoutContext';
import { buildFeedKey } from '@/stores/feedOptimistic/feedOptimistic.types';
import { TimelineGridPosts } from '../../Posts/GridPosts/GridPosts';
import { TimelinePosts } from '../../Posts/Posts';
import { NewPostsSection } from '../NewPostsSection/NewPostsSection';
import type { TimelineFeedContextValue, TimelineFeedProps } from '../TimelineFeed/TimelineFeed.types';
import { TimelineFeedContext } from '../TimelineFeed/TimelineFeedContext';
import { VisualTimelinePosts } from '../TimelineFeed/VisualTimelinePosts';

type TimelineFeedTrailingSlot = Extract<
  TimelineFeedProps,
  { variant: typeof TIMELINE_FEED_VARIANT.BOOKMARKS | typeof TIMELINE_FEED_VARIANT.COLLECTION }
>['trailingSlot'];

interface TimelineFeedContentProps {
  streamId: PostStreamId;
  variant: TimelineFeedProps['variant'];
  tagsLayout: TagsLayout;
  layoutResolution?: FeedLayoutResolution;
  children?: TimelineFeedProps['children'];
  emptyState?: TimelineFeedProps['emptyState'];
  collectionId?: TimelineFeedContextValue['collectionId'];
  pullToRefreshContainerRef?: TimelineFeedProps['pullToRefreshContainerRef'];
  trailingSlot?: TimelineFeedTrailingSlot;
}

interface TimelineFeedWithStreamProps {
  streamId: PostStreamId | undefined;
  variant: TimelineFeedProps['variant'];
  tagsLayout: TagsLayout;
  layoutResolution?: FeedLayoutResolution;
  children?: TimelineFeedProps['children'];
  emptyState?: TimelineFeedProps['emptyState'];
  collectionId?: TimelineFeedContextValue['collectionId'];
  pullToRefreshContainerRef?: TimelineFeedProps['pullToRefreshContainerRef'];
  trailingSlot?: TimelineFeedTrailingSlot;
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
  emptyState,
  collectionId,
  pullToRefreshContainerRef,
  trailingSlot,
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
 * hero + items so pulling from the hero refreshes the collection feed too). Its
 * classes match ContentLayout's main content area (min-w-0 flex-1 gap-6
 * lg:overflow-hidden) to preserve the same flex-col spacing that children
 * previously inherited as direct descendants of that container.
 */
function TimelineFeedContent({
  streamId,
  variant,
  tagsLayout,
  layoutResolution,
  children,
  emptyState,
  collectionId,
  pullToRefreshContainerRef,
  trailingSlot,
}: TimelineFeedContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const refreshContainerRef = pullToRefreshContainerRef ?? containerRef;
  const previousMutedUserIdSetRef = useRef<Set<string> | null>(null);

  const isVisualActive = layoutResolution?.isVisualActive ?? false;
  const isGridActive = layoutResolution?.isGridActive ?? false;
  const {
    postIds: rawPostIds,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
    prependPosts,
    prependOptimisticPosts,
    removePosts,
  } = useStreamPagination({
    streamId,
  });

  const postIds = [...new Set(rawPostIds)];

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

  const { mutedUserIdSet } = useMutedUsers();

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
  }, [mutedUserIdSet, rawPostIds, refresh, removePosts, variant]);

  const contextValue: TimelineFeedContextValue = {
    variant,
    collectionId,
    streamId,
    prependPosts,
    prependOptimisticPosts,
    removePosts,
  };
  const showEndMessage = variant !== TIMELINE_FEED_VARIANT.COLLECTION && variant !== TIMELINE_FEED_VARIANT.BOOKMARKS;
  const shouldRenderChildren = !isVisualActive || isGridActive;

  return (
    <TimelineFeedContext.Provider value={contextValue}>
      <PostMainLayoutProvider tagsLayout={tagsLayout}>
        <Container ref={containerRef} className="min-w-0 flex-1 gap-6 lg:overflow-hidden">
          {enablePullToRefresh && <PullToRefreshIndicator state={pullState} pullDistance={pullDistance} />}
          {shouldRenderChildren ? children : null}
          <NewPostsSection
            streamId={streamId}
            variant={variant}
            postIds={postIds}
            mutedUserIdSet={mutedUserIdSet}
            loading={loading}
            prependPosts={prependPosts}
          />
          {isGridActive ? (
            <TimelineGridPosts
              postIds={postIds}
              loading={loading}
              loadingMore={loadingMore}
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
              loading={loading}
              loadingMore={loadingMore}
              error={error}
              hasMore={hasMore}
              loadMore={loadMore}
            />
          ) : (
            <TimelinePosts
              postIds={postIds}
              loading={loading}
              loadingMore={loadingMore}
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
