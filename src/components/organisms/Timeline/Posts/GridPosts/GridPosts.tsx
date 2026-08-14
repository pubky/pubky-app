'use client';

import type { ReactNode } from 'react';
import { Container } from '@/atoms/Container/Container';
import { GRID_FEED_COLUMNS_CLASS, GRID_FEED_GAP_CLASS } from '@/config/feed';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { usePostListKeyboard } from '@/hooks/usePostListKeyboard/usePostListKeyboard';
import { usePostNavigation } from '@/hooks/usePostNavigation/usePostNavigation';
import { cn } from '@/libs/utils/utils';
import { TimelineEndMessage } from '@/molecules/Timeline/TimelineEndMessage';
import { TimelineError } from '@/molecules/Timeline/TimelineError';
import { TimelineLoadingMore } from '@/molecules/Timeline/TimelineLoadingMore';
import { TimelineStateWrapper } from '@/molecules/Timeline/TimelineStateWrapper/TimelineStateWrapper';
import { PostMain } from '../../../PostMain/PostMain';
import { GridPostsSkeleton } from './GridPosts.skeleton';

interface TimelineGridPostsProps {
  postIds: string[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  /**
   * Whether to render the "You've reached the end" message once the grid is fully
   * loaded. Defaults to `true`. Collection and bookmarks grids set this to
   * `false` because the end-of-feed celebration reads as out of place in these
   * finite, library-style surfaces.
   */
  showEndMessage?: boolean;
  emptyState?: ReactNode;
  /**
   * Optional last grid cell (e.g. Add Content CTA on bookmarks/collection feeds).
   * Rendered after post cards inside the same grid. The cell uses `h-full` so the
   * tile stretches to a taller sibling in the row without imposing min-height.
   */
  trailingSlot?: ReactNode;
}

/**
 * TimelineGridPosts
 *
 * Presentational renderer that lays the timeline's post cards out in a fixed,
 * responsive card grid with infinite scroll. Sibling to `TimelinePosts` (vertical
 * list) and `VisualTimelinePosts` (media tiles); shares the same data contract.
 *
 * Variant-agnostic — it carries no collection-specific logic. `TimelineFeedContent`
 * selects it whenever `layoutResolution.isGridActive` (driven by `GRID_LAYOUT_VARIANTS`),
 * and wraps it in `PostMainLayoutProvider` so each `PostMain` inherits the `inline`
 * tags layout (the only sensible layout in a narrow cell, decision D2).
 *
 * Each cell is a named container (`@container/grid`, `container-type: inline-size`)
 * so the Phase C grid-scoped container-query overrides can adapt the card to the
 * narrow cell width. Because a container query with no ancestor container resolves
 * to `false`, those overrides are inert on every non-grid surface (decision D4).
 *
 * When `trailingSlot` is set, it becomes the last grid cell after all posts.
 * When there are no posts but a trailing slot is present, `emptyState` is still
 * rendered above the grid so the user sees both the empty copy and the CTA tile.
 */
const GRID_TRAILING_CELL_CLASS =
  '@container/grid block h-full w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring [&>*:first-child]:flex-1';

export function TimelineGridPosts({
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
  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading: loadingMore,
    threshold: 3000,
    debounceMs: 20,
  });

  const { handlePostKeyDown } = usePostNavigation();
  const { setCardRef, onListKeyDown } = usePostListKeyboard();
  const hasGridContent = postIds.length > 0 || trailingSlot != null;
  const showEmptyMessageWithTrailingSlot = postIds.length === 0 && trailingSlot != null && emptyState != null;

  return (
    <TimelineStateWrapper
      loading={loading}
      error={error}
      hasItems={hasGridContent}
      hasMore={hasMore}
      loadingComponent={<GridPostsSkeleton />}
      emptyComponent={emptyState}
    >
      <Container
        data-cy="timeline-container"
        overrideDefaults={showEmptyMessageWithTrailingSlot}
        className={showEmptyMessageWithTrailingSlot ? 'flex w-full flex-col gap-6' : undefined}
      >
        {showEmptyMessageWithTrailingSlot ? emptyState : null}
        <Container
          data-cy="timeline-posts-grid"
          overrideDefaults
          role="feed"
          className={cn('grid', GRID_FEED_GAP_CLASS, GRID_FEED_COLUMNS_CLASS)}
          onKeyDown={onListKeyDown}
        >
          {postIds.map((postId, index) => (
            <Container
              key={`grid_${postId}`}
              data-cy="post-card"
              ref={setCardRef(index)}
              role="article"
              aria-posinset={index + 1}
              aria-setsize={postIds.length}
              tabIndex={0}
              onKeyDown={(e) => handlePostKeyDown(postId, e)}
              className="@container/grid rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring [&>*:first-child]:flex-1"
            >
              <PostMain postId={postId} isReply={false} />
            </Container>
          ))}
          {trailingSlot != null ? (
            <Container overrideDefaults className={GRID_TRAILING_CELL_CLASS}>
              {trailingSlot}
            </Container>
          ) : null}
        </Container>

        {/* Suppressed while the grid is empty: the wrapper's skeleton already covers
            loading there (empty-but-hasMore chaining rounds). */}
        {postIds.length > 0 && loadingMore && <TimelineLoadingMore />}

        {error && postIds.length > 0 && <TimelineError message={error} />}

        {showEndMessage && !hasMore && !loadingMore && postIds.length > 0 && <TimelineEndMessage />}

        {/* Infinite-scroll sentinel — only mounted (and given height) while there are more
            posts to observe for. Once the feed reaches its end the observer detaches, so
            rendering it would just leave dead space below the grid. */}
        {hasMore && <Container overrideDefaults className="h-5" ref={sentinelRef} />}
      </Container>
    </TimelineStateWrapper>
  );
}
