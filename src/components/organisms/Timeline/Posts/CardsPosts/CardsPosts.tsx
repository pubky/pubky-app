'use client';

import type { ReactNode } from 'react';
import { Container } from '@/atoms/Container/Container';
import { GRID_FEED_COLUMNS_CLASS, GRID_FEED_GAP_CLASS, TIMELINE_MAX_UNPRODUCTIVE_AUTO_LOADS } from '@/config/feed';
import { useCardsLayout } from '@/hooks/useCardsLayout/useCardsLayout';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { usePostHeaderVisibility } from '@/hooks/usePostHeaderVisibility/usePostHeaderVisibility';
import { getDisplayedPostId } from '@/hooks/usePostHeaderVisibility/usePostHeaderVisibility.utils';
import { usePostListKeyboard } from '@/hooks/usePostListKeyboard/usePostListKeyboard';
import type { UsePostListKeyboardResult } from '@/hooks/usePostListKeyboard/usePostListKeyboard.types';
import { usePostNavigation } from '@/hooks/usePostNavigation/usePostNavigation';
import { cn, isPostDeleted } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import { TimelineEndMessage } from '@/molecules/Timeline/TimelineEndMessage';
import { TimelineError } from '@/molecules/Timeline/TimelineError';
import { TimelineLoadingMore } from '@/molecules/Timeline/TimelineLoadingMore';
import { TimelineLoadMore } from '@/molecules/Timeline/TimelineLoadMore';
import { TimelineStateWrapper } from '@/molecules/Timeline/TimelineStateWrapper/TimelineStateWrapper';
import { CollectionCard } from '@/organisms/Collections/CollectionCard/CollectionCard';
import { PostMain } from '@/organisms/PostMain/PostMain';
import { CardsPostSkeleton, CardsPostsSkeleton } from './CardsPosts.skeleton';

interface TimelineCardsPostsProps {
  postIds: string[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  /**
   * Whether to render the "You've reached the end" message once the Cards feed is fully
   * loaded. Defaults to `true`. Collection and bookmarks Cards feeds set this to
   * `false` because the end-of-feed celebration reads as out of place in these
   * finite, library-style surfaces.
   */
  showEndMessage?: boolean;
  emptyState?: ReactNode;
  /**
   * Optional Add Post tile placed after the posts in the shortest column.
   */
  trailingSlot?: ReactNode;
}

function CardsPost({
  postId,
  index,
  totalCount,
  setCardRef,
}: {
  postId: string;
  index: number;
  totalCount: number;
  setCardRef: UsePostListKeyboardResult['setCardRef'];
}) {
  const { postDetails, isLoading } = usePostDetails(postId);
  const identity = parseCompositeId(postId);
  // Resolve the envelope before mounting other local-first readers of this post.
  // Passing an empty id keeps the visibility hook's details/relationship queries disabled.
  const visibility = usePostHeaderVisibility(postDetails ? postId : '');
  const displayedPostId = getDisplayedPostId(postId, visibility);
  const { handlePostKeyDown } = usePostNavigation();
  return (
    <Container
      data-cy="post-card"
      ref={setCardRef(index)}
      role="article"
      aria-posinset={index + 1}
      aria-setsize={totalCount}
      tabIndex={0}
      onKeyDown={(e) => handlePostKeyDown(displayedPostId, e)}
      className="@container/grid min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {postDetails === undefined || isLoading ? (
        <CardsPostSkeleton index={index} />
      ) : postDetails?.kind === 'collection' && !isPostDeleted(postDetails.content) ? (
        <CollectionCard authorPubky={identity.pubky} postId={identity.id} />
      ) : (
        <PostMain postId={postId} postDetails={postDetails} isReply={false} presentation="cards" />
      )}
    </Container>
  );
}

export function TimelineCardsPosts({
  postIds,
  loading,
  loadingMore,
  error,
  hasMore,
  loadMore,
  showEndMessage = true,
  emptyState,
  trailingSlot,
}: TimelineCardsPostsProps) {
  // Rounds that surface nothing new (a long client-side-filtered region) are budgeted;
  // past the budget the sentinel stops and the manual Load more below takes over (#2523).
  const { sentinelRef, isStalled, resumeAutoLoad } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading: loadingMore,
    threshold: 3000,
    debounceMs: 20,
    itemCount: postIds.length,
    maxUnproductiveLoads: TIMELINE_MAX_UNPRODUCTIVE_AUTO_LOADS,
  });

  const cardsRef = useCardsLayout(postIds, trailingSlot != null);
  const { setCardRef, onListKeyDown } = usePostListKeyboard();
  const hasGridContent = postIds.length > 0 || trailingSlot != null;
  const showEmptyMessageWithTrailingSlot = postIds.length === 0 && trailingSlot != null && emptyState != null;

  return (
    <TimelineStateWrapper
      loading={loading}
      error={error}
      hasItems={hasGridContent}
      hasMore={hasMore}
      stalled={isStalled}
      loadingComponent={<CardsPostsSkeleton />}
      emptyComponent={emptyState}
    >
      <Container
        data-cy="timeline-container"
        overrideDefaults={showEmptyMessageWithTrailingSlot}
        className={showEmptyMessageWithTrailingSlot ? 'flex w-full flex-col gap-4' : undefined}
      >
        {showEmptyMessageWithTrailingSlot ? emptyState : null}
        <Container
          data-cy="timeline-posts-cards"
          ref={cardsRef}
          overrideDefaults
          role="feed"
          className={cn('relative grid items-start', GRID_FEED_GAP_CLASS, GRID_FEED_COLUMNS_CLASS)}
          onKeyDown={onListKeyDown}
        >
          {postIds.map((postId, index) => (
            <CardsPost key={postId} postId={postId} index={index} totalCount={postIds.length} setCardRef={setCardRef} />
          ))}
          {trailingSlot != null ? (
            <Container overrideDefaults className="@container/grid min-h-48 [&>*:first-child]:min-h-48">
              {trailingSlot}
            </Container>
          ) : null}
        </Container>

        {/* Suppressed while the grid is empty: the wrapper's skeleton already covers
            loading there (empty-but-hasMore chaining rounds). */}
        {postIds.length > 0 && loadingMore && <TimelineLoadingMore />}

        {error && postIds.length > 0 && <TimelineError message={error} />}

        {showEndMessage && !hasMore && !loadingMore && postIds.length > 0 && <TimelineEndMessage />}

        {hasMore && isStalled && !loadingMore && <TimelineLoadMore onLoadMore={resumeAutoLoad} />}

        {/* Infinite-scroll sentinel — only mounted (and given height) while there are more
            posts to observe for and auto-loading is not stalled. Once the feed reaches its
            end the observer detaches, so rendering it would just leave dead space below the grid. */}
        {hasMore && !isStalled && <Container overrideDefaults className="h-5" ref={sentinelRef} />}
      </Container>
    </TimelineStateWrapper>
  );
}
