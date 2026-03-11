'use client';

import { useEffect } from 'react';
import * as Core from '@/core';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import type { TagsLayout } from '../../../PostMain/PostMain.types';
import type { TimelineFeedProps, TimelineFeedContextValue } from '../TimelineFeed/TimelineFeed.types';
import { TIMELINE_FEED_VARIANT } from '../TimelineFeed/TimelineFeed.types';
import { TimelineFeedContext } from '../TimelineFeed/TimelineFeedContext';
import { NewPostsSection } from '../NewPostsSection';

interface TimelineFeedContentProps {
  streamId: Core.PostStreamId;
  variant: TimelineFeedProps['variant'];
  tagsLayout: TagsLayout;
  children?: TimelineFeedProps['children'];
}

interface TimelineFeedWithStreamProps {
  streamId: Core.PostStreamId | undefined;
  variant: TimelineFeedProps['variant'];
  tagsLayout: TagsLayout;
  children?: TimelineFeedProps['children'];
}

/**
 * TimelineFeedWithStream
 *
 * Guard component that shows a loading state until the streamId is resolved,
 * then delegates to TimelineFeedContent.
 */
export function TimelineFeedWithStream({ streamId, variant, tagsLayout, children }: TimelineFeedWithStreamProps) {
  if (!streamId) {
    return <Molecules.TimelineLoading />;
  }

  return (
    <TimelineFeedContent streamId={streamId} variant={variant} tagsLayout={tagsLayout}>
      {children}
    </TimelineFeedContent>
  );
}

/**
 * TimelineFeedContent
 *
 * Core component that manages stream pagination, muting, pull-to-refresh,
 * and provides the TimelineFeedContext to children.
 */
function TimelineFeedContent({ streamId, variant, tagsLayout, children }: TimelineFeedContentProps) {
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

  const { unreadPostIds } = Hooks.useUnreadPosts({ streamId });
  const { mutedUserIdSet } = Hooks.useMutedUsers();

  const enablePullToRefresh =
    variant === TIMELINE_FEED_VARIANT.HOME ||
    variant === TIMELINE_FEED_VARIANT.CUSTOM ||
    variant === TIMELINE_FEED_VARIANT.HOT;
  const { state: pullState, pullDistance } = Hooks.usePullToRefresh({
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
      {enablePullToRefresh && <Molecules.PullToRefreshIndicator state={pullState} pullDistance={pullDistance} />}
      {children}
      <NewPostsSection
        streamId={streamId}
        unreadPostIds={unreadPostIds}
        postIds={postIds}
        mutedUserIdSet={mutedUserIdSet}
        loading={loading}
        prependPosts={prependPosts}
      />
      <Organisms.TimelinePosts
        postIds={postIds}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        hasMore={hasMore}
        loadMore={loadMore}
        tagsLayout={tagsLayout}
      />
    </TimelineFeedContext.Provider>
  );
}
