'use client';

import { Container } from '@/atoms/Container/Container';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { usePostNavigation } from '@/hooks/usePostNavigation/usePostNavigation';
import { TimelineEndMessage } from '@/molecules/Timeline/TimelineEndMessage';
import { TimelineError } from '@/molecules/Timeline/TimelineError';
import { TimelineLoadingMore } from '@/molecules/Timeline/TimelineLoadingMore';
import { TimelineStateWrapper } from '@/molecules/Timeline/TimelineStateWrapper/TimelineStateWrapper';
import { PostMain } from '../../PostMain/PostMain';
import { TimelinePostReplies } from '../PostReplies/PostReplies';

interface TimelinePostsProps {
  postIds: string[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
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
export function TimelinePosts({ postIds, loading, loadingMore, error, hasMore, loadMore }: TimelinePostsProps) {
  const { navigateToPost } = usePostNavigation();

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading: loadingMore,
    threshold: 3000,
    debounceMs: 20,
  });

  return (
    <TimelineStateWrapper loading={loading} error={error} hasItems={postIds.length > 0}>
      <Container data-cy="timeline-container">
        <Container data-cy="timeline-posts" overrideDefaults className="space-y-4">
          {postIds.map((postId) => (
            <Container key={`main_${postId}`} data-cy="post-card">
              <PostMain postId={postId} onClick={() => navigateToPost(postId)} isReply={false} />
              <TimelinePostReplies postId={postId} />
            </Container>
          ))}

          {loadingMore && <TimelineLoadingMore />}

          {error && postIds.length > 0 && <TimelineError message={error} />}

          {!hasMore && !loadingMore && postIds.length > 0 && <TimelineEndMessage />}

          <Container overrideDefaults className="h-5" ref={sentinelRef} />
        </Container>
      </Container>
    </TimelineStateWrapper>
  );
}
