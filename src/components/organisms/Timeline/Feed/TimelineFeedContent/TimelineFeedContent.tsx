'use client';

import { useEffect, useRef } from 'react';
import { MuteFilter } from '@/application/stream/posts/muting/mute-filter';
import { Container } from '@/atoms/Container/Container';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import type { FeedLayoutResolution } from '@/hooks/useFeedLayoutResolution/useFeedLayoutResolution';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import { usePullToRefresh } from '@/hooks/usePullToRefresh/usePullToRefresh';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import { PullToRefreshIndicator } from '@/molecules/PullToRefreshIndicator/PullToRefreshIndicator';
import { TimelineLoading } from '@/molecules/Timeline/TimelineLoading';
import type { TagsLayout } from '@/organisms/PostMain/PostMain.types';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayout';
import { TimelinePosts } from '../../Posts/Posts';
import { NewPostsSection } from '../NewPostsSection/NewPostsSection';
import type { TimelineFeedContextValue, TimelineFeedProps } from '../TimelineFeed/TimelineFeed.types';
import { TimelineFeedContext } from '../TimelineFeed/TimelineFeedContext';
import { VisualTimelinePosts } from '../TimelineFeed/VisualTimelinePosts';

interface TimelineFeedContentProps {
  streamId: PostStreamId;
  variant: TimelineFeedProps['variant'];
  tagsLayout: TagsLayout;
  layoutResolution?: FeedLayoutResolution;
  children?: TimelineFeedProps['children'];
}

interface TimelineFeedWithStreamProps {
  streamId: PostStreamId | undefined;
  variant: TimelineFeedProps['variant'];
  tagsLayout: TagsLayout;
  layoutResolution?: FeedLayoutResolution;
  children?: TimelineFeedProps['children'];
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
 * The outermost Atoms.Container carries the containerRef so that pull-to-refresh
 * touch events are scoped to this feed area only. Its classes match
 * ContentLayout's main content area (min-w-0 flex-1 gap-6 lg:overflow-hidden)
 * to preserve the same flex-col spacing that children previously inherited as
 * direct descendants of that container.
 */
function TimelineFeedContent({ streamId, variant, tagsLayout, layoutResolution, children }: TimelineFeedContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const isVisualActive = layoutResolution?.isVisualActive ?? false;
  const {
    postIds: rawPostIds,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
    prependPosts,
    removePosts,
  } = useStreamPagination({
    streamId,
  });

  const postIds = [...new Set(rawPostIds)];

  const { mutedUserIdSet } = useMutedUsers();

  const enablePullToRefresh =
    variant === TIMELINE_FEED_VARIANT.HOME ||
    variant === TIMELINE_FEED_VARIANT.CUSTOM ||
    variant === TIMELINE_FEED_VARIANT.HOT;
  const { state: pullState, pullDistance } = usePullToRefresh({
    containerRef,
    onRefresh: refresh,
    disabled: !enablePullToRefresh,
  });

  useEffect(() => {
    if (variant === TIMELINE_FEED_VARIANT.PROFILE) return;
    if (mutedUserIdSet.size === 0) return;

    const postIdsToRemove = rawPostIds.filter((id) => MuteFilter.isPostMuted(id, mutedUserIdSet));

    if (postIdsToRemove.length > 0) {
      removePosts(postIdsToRemove);
    }
  }, [mutedUserIdSet, rawPostIds, removePosts, variant]);

  const contextValue: TimelineFeedContextValue = {
    prependPosts,
    removePosts,
  };

  return (
    <TimelineFeedContext.Provider value={contextValue}>
      <PostMainLayoutProvider tagsLayout={tagsLayout}>
        <Container ref={containerRef} className="min-w-0 flex-1 gap-6 lg:overflow-hidden">
          {enablePullToRefresh && <PullToRefreshIndicator state={pullState} pullDistance={pullDistance} />}
          {!isVisualActive ? children : null}
          <NewPostsSection
            streamId={streamId}
            postIds={postIds}
            mutedUserIdSet={mutedUserIdSet}
            loading={loading}
            prependPosts={prependPosts}
          />
          {isVisualActive ? (
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
            />
          )}
        </Container>
      </PostMainLayoutProvider>
    </TimelineFeedContext.Provider>
  );
}
