'use client';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import { TIMELINE_ITEM_TYPE } from './Posts.constants';
import type { TimelinePostsProps } from './Posts.types';

/**
 * TimelinePosts
 *
 * Presentational component that displays posts in a timeline with infinite scroll.
 * Receives all data and handlers from a parent component.
 * Groups plain reposts of the same original post into a single card.
 */
export function TimelinePosts({ postIds, loading, loadingMore, error, hasMore, loadMore }: TimelinePostsProps) {
  const { navigateToPost } = Hooks.usePostNavigation();
  const { items, isGrouping } = Hooks.useRepostGrouping({ postIds });

  // Infinite scroll hook
  const { sentinelRef } = Hooks.useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading: loadingMore,
    threshold: 3000,
    debounceMs: 20,
  });

  return (
    <Molecules.TimelineStateWrapper loading={loading || isGrouping} error={error} hasItems={postIds.length > 0}>
      <Atoms.Container data-cy="timeline-container">
        <Atoms.Container data-cy="timeline-posts" overrideDefaults className="space-y-4">
          {items.map((item) => {
            if (item.type === TIMELINE_ITEM_TYPE.SINGLE) {
              return (
                <Atoms.Container key={`main_${item.postId}`} data-cy="post-card">
                  <Organisms.PostMain
                    postId={item.postId}
                    onClick={() => navigateToPost(item.postId)}
                    isReply={false}
                  />
                  <Organisms.TimelinePostReplies postId={item.postId} onPostClick={navigateToPost} />
                </Atoms.Container>
              );
            }

            // Repost group - display original post with grouped header
            return (
              <Atoms.Container key={`group_${item.originalPostId}`} data-cy="post-card">
                <Organisms.PostMain
                  postId={item.originalPostId}
                  repostGroup={item}
                  onClick={() => navigateToPost(item.originalPostId)}
                  isReply={false}
                />
                <Organisms.TimelinePostReplies postId={item.originalPostId} onPostClick={navigateToPost} />
              </Atoms.Container>
            );
          })}

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
