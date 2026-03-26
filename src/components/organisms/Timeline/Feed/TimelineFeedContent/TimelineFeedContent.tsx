'use client';

import { useEffect, useRef } from 'react';
import { TIMELINE_FEED_VARIANT } from '@/config';
import * as Core from '@/core';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import type { TagsLayout } from '../../../PostMain/PostMain.types';
import type { TimelineFeedProps, TimelineFeedContextValue } from '../TimelineFeed/TimelineFeed.types';
import { TimelineFeedContext } from '../TimelineFeed/TimelineFeedContext';
import { NewPostsSection } from '../NewPostsSection';
import { VisualTimelinePosts } from '../TimelineFeed/VisualTimelinePosts';

interface TimelineFeedContentProps {
  streamId: Core.PostStreamId;
  variant: TimelineFeedProps['variant'];
  tagsLayout: TagsLayout;
  layoutResolution?: Hooks.FeedLayoutResolution;
  children?: TimelineFeedProps['children'];
}

interface TimelineFeedWithStreamProps {
  streamId: Core.PostStreamId | undefined;
  variant: TimelineFeedProps['variant'];
  tagsLayout: TagsLayout;
  layoutResolution?: Hooks.FeedLayoutResolution;
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
    return <Molecules.TimelineLoading />;
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
 * Core component that manages stream pagination, muting, pull-to-refresh,
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
  } = Hooks.useStreamPagination({
    streamId,
  });

  const postIds = [...new Set(rawPostIds)];

  const { mutedUserIdSet } = Hooks.useMutedUsers();

  const enablePullToRefresh =
    variant === TIMELINE_FEED_VARIANT.HOME ||
    variant === TIMELINE_FEED_VARIANT.CUSTOM ||
    variant === TIMELINE_FEED_VARIANT.HOT;
  const { state: pullState, pullDistance } = Hooks.usePullToRefresh({
    containerRef,
    onRefresh: refresh,
    disabled: !enablePullToRefresh,
  });

  useEffect(() => {
    if (variant === TIMELINE_FEED_VARIANT.PROFILE) return;
    if (mutedUserIdSet.size === 0) return;

    const postIdsToRemove = rawPostIds.filter((id) => Core.MuteFilter.isPostMuted(id, mutedUserIdSet));

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
      <Atoms.Container ref={containerRef} className="min-w-0 flex-1 gap-6 lg:overflow-hidden">
        {enablePullToRefresh && <Molecules.PullToRefreshIndicator state={pullState} pullDistance={pullDistance} />}
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
          <Organisms.TimelinePosts
            postIds={postIds}
            loading={loading}
            loadingMore={loadingMore}
            error={error}
            hasMore={hasMore}
            loadMore={loadMore}
            tagsLayout={tagsLayout}
          />
        )}
      </Atoms.Container>
    </TimelineFeedContext.Provider>
  );
}
