'use client';

import type { ReactNode } from 'react';
import { Container } from '@/atoms/Container/Container';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { usePostListKeyboard } from '@/hooks/usePostListKeyboard/usePostListKeyboard';
import { usePostNavigation } from '@/hooks/usePostNavigation/usePostNavigation';
import { TimelineEndMessage } from '@/molecules/Timeline/TimelineEndMessage';
import { TimelineError } from '@/molecules/Timeline/TimelineError';
import { TimelineLoadingMore } from '@/molecules/Timeline/TimelineLoadingMore';
import { TimelineStateWrapper } from '@/molecules/Timeline/TimelineStateWrapper/TimelineStateWrapper';
import { TimelineFeedItem } from './FeedItem/TimelineFeedItem';

interface TimelinePostsProps {
  postIds: string[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  emptyState?: ReactNode;
  trailingSlot?: ReactNode;
  showEndMessage?: boolean;
}

/**
 * TimelinePosts
 *
 * Presentational component that displays posts in a timeline with infinite scroll.
 * Receives all data and handlers from a parent component.
 *
 * The surface (TimelineFeedContent) wraps this in PostMainLayoutProvider so each
 * PostMain / nested reply inherits the active tags layout via context.
 */
export function TimelinePosts({
  postIds,
  loading,
  loadingMore,
  error,
  hasMore,
  loadMore,
  emptyState,
  trailingSlot,
  showEndMessage = true,
}: TimelinePostsProps) {
  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading: loadingMore,
    threshold: 3000,
    debounceMs: 20,
  });

  const { handlePostKeyDown } = usePostNavigation();
  const { setCardRef, onListKeyDown } = usePostListKeyboard();
  const hasListContent = postIds.length > 0 || trailingSlot != null;
  const showEmptyMessageWithTrailingSlot = postIds.length === 0 && trailingSlot != null && emptyState != null;

  return (
    <TimelineStateWrapper loading={loading} error={error} hasItems={hasListContent} emptyComponent={emptyState}>
      <Container
        data-cy="timeline-container"
        overrideDefaults={showEmptyMessageWithTrailingSlot}
        className={showEmptyMessageWithTrailingSlot ? 'flex w-full flex-col gap-6' : undefined}
      >
        {showEmptyMessageWithTrailingSlot ? emptyState : null}
        <Container
          data-cy="timeline-posts"
          overrideDefaults
          role="feed"
          className="space-y-4"
          onKeyDown={onListKeyDown}
        >
          {postIds.map((postId, index) => (
            <TimelineFeedItem
              key={`main_${postId}`}
              postId={postId}
              index={index}
              totalCount={postIds.length}
              setCardRef={setCardRef}
              onPostKeyDown={handlePostKeyDown}
            />
          ))}

          {trailingSlot}

          {loadingMore && <TimelineLoadingMore />}

          {error && postIds.length > 0 && <TimelineError message={error} />}

          {showEndMessage && !hasMore && !loadingMore && postIds.length > 0 && <TimelineEndMessage />}

          {/* Infinite-scroll sentinel — only mounted (and given height) while there are
              more posts to observe for, mirroring TimelineGridPosts. Once the feed is
              fully loaded the observer detaches, so rendering it would just leave dead
              space below the list. */}
          {hasMore && <Container overrideDefaults className="h-5" ref={sentinelRef} />}
        </Container>
      </Container>
    </TimelineStateWrapper>
  );
}
