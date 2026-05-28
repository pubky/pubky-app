'use client';

import type { ReactNode } from 'react';
import { Container } from '@/atoms/Container/Container';
import { useBookmarksStreamId } from '@/hooks/useBookmarksStreamId/useBookmarksStreamId';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { usePostListKeyboard } from '@/hooks/usePostListKeyboard/usePostListKeyboard';
import { usePostNavigation } from '@/hooks/usePostNavigation/usePostNavigation';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import { TimelineError } from '@/molecules/Timeline/TimelineError';
import { TimelineLoadingMore } from '@/molecules/Timeline/TimelineLoadingMore';
import { TimelineStateWrapper } from '@/molecules/Timeline/TimelineStateWrapper/TimelineStateWrapper';
import { PostMain } from '@/organisms/PostMain/PostMain';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayoutContext';
import { getTagsLayoutForSurfaceLayout } from '@/organisms/PostMain/PostMainLayoutRules';
import { TimelineFeedContext } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedContext';
import { CONTENT, LAYOUT } from '@/stores/home/home.types';

interface BookmarksCollectionPostsProps {
  emptyComponent: ReactNode;
}

export function BookmarksCollectionPosts({ emptyComponent }: BookmarksCollectionPostsProps) {
  const streamId = useBookmarksStreamId(CONTENT.ALL);
  const {
    postIds: rawPostIds,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    prependPosts,
    removePosts,
  } = useStreamPagination({ streamId });
  const postIds = [...new Set(rawPostIds)];
  const tagsLayout = getTagsLayoutForSurfaceLayout(LAYOUT.COLUMNS);
  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading: loadingMore,
    threshold: 3000,
    debounceMs: 20,
  });
  const { handlePostKeyDown } = usePostNavigation();
  const { setCardRef, onListKeyDown } = usePostListKeyboard();

  return (
    <TimelineFeedContext.Provider value={{ prependPosts, removePosts }}>
      <PostMainLayoutProvider tagsLayout={tagsLayout} surface="collection">
        <TimelineStateWrapper
          loading={loading}
          error={error}
          hasItems={postIds.length > 0}
          emptyComponent={emptyComponent}
        >
          <Container data-cy="bookmarks-collection-posts-container">
            <Container
              overrideDefaults
              role="feed"
              data-cy="bookmarks-collection-posts"
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
              onKeyDown={onListKeyDown}
            >
              {postIds.map((postId, index) => (
                <Container
                  key={`bookmark_${postId}`}
                  data-cy="post-card"
                  ref={setCardRef(index)}
                  role="article"
                  aria-posinset={index + 1}
                  aria-setsize={postIds.length}
                  tabIndex={0}
                  onKeyDown={(event) => handlePostKeyDown(postId, event)}
                  className="min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <PostMain postId={postId} isReply={false} className="h-full" />
                </Container>
              ))}

              {loadingMore && (
                <Container overrideDefaults className="col-span-full">
                  <TimelineLoadingMore />
                </Container>
              )}

              {error && postIds.length > 0 && (
                <Container overrideDefaults className="col-span-full">
                  <TimelineError message={error} />
                </Container>
              )}

              <Container overrideDefaults className="col-span-full h-5" ref={sentinelRef} />
            </Container>
          </Container>
        </TimelineStateWrapper>
      </PostMainLayoutProvider>
    </TimelineFeedContext.Provider>
  );
}
