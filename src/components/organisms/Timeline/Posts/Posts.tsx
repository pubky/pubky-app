'use client';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import type { TagsLayout } from '../../PostMain/PostMain.types';

interface TimelinePostsProps {
  postIds: string[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  tagsLayout?: TagsLayout;
}

/**
 * TimelinePosts
 *
 * Presentational component that displays posts in a timeline with infinite scroll.
 * Receives all data and handlers from a parent component.
 */
export function TimelinePosts({
  postIds,
  loading,
  loadingMore,
  error,
  hasMore,
  loadMore,
  tagsLayout,
}: TimelinePostsProps) {
  const { navigateToPost } = Hooks.usePostNavigation();

  // Infinite scroll hook
  const { sentinelRef } = Hooks.useInfiniteScroll({
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
              <Organisms.PostMain
                postId={postId}
                onClick={() => navigateToPost(postId)}
                isReply={false}
                tagsLayout={tagsLayout}
              />
              <Organisms.TimelinePostReplies postId={postId} />
            </Atoms.Container>
          ))}

          {/* Loading More Indicator */}
          {loadingMore && <Molecules.TimelineLoadingMore />}

          {/* Error on loading more */}
          {error && postIds.length > 0 && <Molecules.TimelineError message={error} />}

          {/* End of posts message */}
          {!hasMore && !loadingMore && postIds.length > 0 && <Molecules.TimelineEndMessage />}

          {/* Infinite scroll sentinel */}
          <Atoms.Container overrideDefaults className="h-5" ref={sentinelRef} />
        </Atoms.Container>
      </Atoms.Container>
    </Molecules.TimelineStateWrapper>
  );
}
