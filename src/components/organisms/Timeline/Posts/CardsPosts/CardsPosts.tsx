'use client';

import { Container } from '@/atoms/Container/Container';
import { GRID_FEED_COLUMNS_CLASS, GRID_FEED_GAP_CLASS, TIMELINE_MAX_UNPRODUCTIVE_AUTO_LOADS } from '@/config/feed';
import { useCardsLayout } from '@/hooks/useCardsLayout/useCardsLayout';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { usePostHeaderVisibility } from '@/hooks/usePostHeaderVisibility/usePostHeaderVisibility';
import { getDisplayedPostId } from '@/hooks/usePostHeaderVisibility/usePostHeaderVisibility.utils';
import { usePostListKeyboard } from '@/hooks/usePostListKeyboard/usePostListKeyboard';
import type { UsePostListKeyboardResult } from '@/hooks/usePostListKeyboard/usePostListKeyboard.types';
import { usePostNavigation } from '@/hooks/usePostNavigation/usePostNavigation';
import { cn } from '@/libs/utils/utils';
import { TimelineEndMessage } from '@/molecules/Timeline/TimelineEndMessage';
import { TimelineError } from '@/molecules/Timeline/TimelineError';
import { TimelineLoadingMore } from '@/molecules/Timeline/TimelineLoadingMore';
import { TimelineLoadMore } from '@/molecules/Timeline/TimelineLoadMore';
import { TimelineStateWrapper } from '@/molecules/Timeline/TimelineStateWrapper/TimelineStateWrapper';
import { PostMain } from '@/organisms/PostMain/PostMain';
import type { TimelineGridPostsProps } from '../GridPosts/GridPosts.types';
import { CardsPostsSkeleton } from './CardsPosts.skeleton';

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
  const visibility = usePostHeaderVisibility(postId);
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
      <PostMain postId={postId} isReply={false} presentation="cards" />
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
}: TimelineGridPostsProps) {
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
