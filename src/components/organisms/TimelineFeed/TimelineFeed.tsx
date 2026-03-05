'use client';

import { createContext, useContext, useCallback, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import * as Core from '@/core';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import type { TagsLayout } from '../PostMain/PostMain.types';
import type { TimelineFeedProps, TimelineFeedContextValue } from './TimelineFeed.types';
import { TIMELINE_FEED_VARIANT } from './TimelineFeed.types';
import { useTimelineFeedStreamId } from './useTimelineFeedStreamId';

/**
 * Context for timeline feed operations
 * Allows children (like PostInput) to access prependPosts
 */
const TimelineFeedContext = createContext<TimelineFeedContextValue | null>(null);

/**
 * Hook to access the timeline feed context
 *
 * @returns The timeline feed context value or null if not inside TimelineFeed
 *
 * @example
 * ```tsx
 * function PostInput() {
 *   const timelineFeed = useTimelineFeedContext();
 *
 *   const handlePostSuccess = (postId: string) => {
 *     timelineFeed?.prependPosts(postId);
 *   };
 * }
 * ```
 */
export function useTimelineFeedContext(): TimelineFeedContextValue | null {
  return useContext(TimelineFeedContext);
}

/**
 * TimelineFeed
 *
 * Organism that encapsulates stream calculation and pagination logic.
 * Provides a context for prependPosts coordination with children components.
 *
 * @example
 * ```tsx
 * // Home page with PostInput
 * <TimelineFeed variant="home">
 *   <PostInput variant="post" />
 * </TimelineFeed>
 *
 * // Bookmarks page (no children)
 * <TimelineFeed variant="bookmarks" />
 *
 * // Profile page (inside ProfileProvider)
 * <TimelineFeed variant="profile" />
 * ```
 */
export function TimelineFeed({ variant, children }: TimelineFeedProps) {
  const streamId = useTimelineFeedStreamId(variant);

  // Show loading state while waiting for stream ID (e.g., profile data loading)
  if (!streamId) {
    return <Molecules.TimelineLoading />;
  }

  return (
    <TimelineFeedContent streamId={streamId} variant={variant}>
      {children}
    </TimelineFeedContent>
  );
}

/**
 * Internal component that handles the actual timeline rendering
 * Separated to avoid calling hooks conditionally
 */
function TimelineFeedContent({
  streamId,
  variant,
  children,
}: {
  streamId: Core.PostStreamId;
  variant: TimelineFeedProps['variant'];
  children?: TimelineFeedProps['children'];
}) {
  const t = useTranslations('toast.post');

  const { layout: homeLayout } = Core.useHomeStore();
  const customFeed = Hooks.useCustomFeed();
  const customFeedLayout =
    customFeed?.layout !== undefined ? Core.pubkyLayoutToHomeLayout(customFeed.layout) : undefined;
  const effectiveLayout = customFeedLayout ?? homeLayout;
  const tagsLayout: TagsLayout = effectiveLayout === Core.LAYOUT.WIDE ? 'side' : 'inline';

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

  // Deduplicate postIds to prevent React key errors from race conditions
  const postIds = useMemo(() => [...new Set(rawPostIds)], [rawPostIds]);

  // Watch for unread posts from StreamCoordinator polling
  const { unreadPostIds } = Hooks.useUnreadPosts({ streamId });
  const { mutedUserIdSet } = Hooks.useMutedUsers();

  // Track scroll position to show/hide new posts button
  const isScrolled = Hooks.useIsScrolledFromTop();

  // Pull-to-refresh - enabled for home, custom and hot variants on touch devices
  const enablePullToRefresh =
    variant === TIMELINE_FEED_VARIANT.HOME ||
    variant === TIMELINE_FEED_VARIANT.CUSTOM ||
    variant === TIMELINE_FEED_VARIANT.HOT;
  const { state: pullState, pullDistance } = Hooks.usePullToRefresh({
    onRefresh: refresh,
    disabled: !enablePullToRefresh,
  });

  // Filter out posts that are already displayed in the timeline
  // This prevents showing "See new posts" for posts the user just created
  const actualNewPostIds = useMemo(() => {
    const displayedPostIds = new Set(postIds);
    // First filter out already-displayed posts, then apply mute filter
    const notDisplayed = unreadPostIds.filter((id) => !displayedPostIds.has(id));
    return Core.MuteFilter.filterPostsSafe(notDisplayed, mutedUserIdSet);
  }, [unreadPostIds, postIds, mutedUserIdSet]);

  /**
   * Reactively prune muted users' posts from the timeline when mute state changes.
   * Skip for profile variant - users should always see posts on their own profile.
   */
  useEffect(() => {
    if (variant === TIMELINE_FEED_VARIANT.PROFILE) return;
    if (mutedUserIdSet.size === 0) return;

    const postIdsToRemove = rawPostIds.filter((id) => Core.MuteFilter.isPostMuted(id, mutedUserIdSet));

    if (postIdsToRemove.length > 0) {
      removePosts(postIdsToRemove);
    }
  }, [mutedUserIdSet, rawPostIds, removePosts, variant]);

  const actualNewCount = actualNewPostIds.length;

  /**
   * Handle clicking the "New Posts" button
   * 1. Merge unread posts into the main post stream
   * 2. Clear unread stream and prepend only the actual new posts to UI
   * 3. Scroll to top
   */
  const handleNewPostsClick = useCallback(async () => {
    try {
      // Merge unread into post_streams in the database
      await Core.StreamPostsController.mergeUnreadStreamWithPostStream({ streamId });

      // Clear unread stream
      await Core.StreamPostsController.clearUnreadStream({ streamId });

      // Filter out deleted posts before prepending to prevent ghost posts
      // This handles race conditions where posts were deleted after being added to unread stream
      const existingPosts = await Core.StreamPostsController.filterDeletedPosts(actualNewPostIds);
      const displayedPostIdsSet = new Set(postIds);
      const postsToAdd = existingPosts.filter((id) => !displayedPostIdsSet.has(id));

      if (postsToAdd.length > 0) {
        prependPosts(postsToAdd);
      }

      // Scroll to top smoothly
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      Libs.Logger.error('Failed to load new posts:', error);
      Molecules.showErrorToast({
        title: t('failedToLoadPosts'),
        description: t('failedToLoadPostsDesc'),
      });
    }
  }, [streamId, prependPosts, actualNewPostIds, postIds, t]);

  const contextValue: TimelineFeedContextValue = {
    prependPosts,
    removePosts,
  };

  return (
    <TimelineFeedContext.Provider value={contextValue}>
      {/* Pull-to-refresh indicator - only shown for home & hot variants */}
      {enablePullToRefresh && <Molecules.PullToRefreshIndicator state={pullState} pullDistance={pullDistance} />}
      {children}
      <Molecules.NewPostsButton
        count={actualNewCount}
        onClick={handleNewPostsClick}
        visible={actualNewCount > 0 && !loading}
        isScrolled={isScrolled}
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
