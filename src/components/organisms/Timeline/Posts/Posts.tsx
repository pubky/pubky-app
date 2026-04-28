'use client';

import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { usePostNavigation } from '@/hooks/usePostNavigation/usePostNavigation';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';

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
    <Molecules.TimelineStateWrapper loading={loading} error={error} hasItems={postIds.length > 0}>
      <Atoms.Container data-cy="timeline-container">
        <Atoms.Container data-cy="timeline-posts" overrideDefaults className="space-y-4">
          {postIds.map((postId) => (
            <Atoms.Container key={`main_${postId}`} data-cy="post-card">
              <Organisms.PostMain postId={postId} onClick={() => navigateToPost(postId)} isReply={false} />
              <Organisms.TimelinePostReplies postId={postId} />
            </Atoms.Container>
          ))}

          {loadingMore && <Molecules.TimelineLoadingMore />}

          {error && postIds.length > 0 && <Molecules.TimelineError message={error} />}

          {!hasMore && !loadingMore && postIds.length > 0 && <Molecules.TimelineEndMessage />}

          <Atoms.Container overrideDefaults className="h-5" ref={sentinelRef} />
        </Atoms.Container>
      </Atoms.Container>
    </Molecules.TimelineStateWrapper>
  );
}
