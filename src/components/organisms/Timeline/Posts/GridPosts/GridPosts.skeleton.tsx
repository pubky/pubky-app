'use client';

import { Container } from '@/atoms/Container/Container';
import { GRID_FEED_COLUMNS_CLASS, GRID_FEED_GAP_CLASS } from '@/config/feed';
import { cn } from '@/libs/utils/utils';
import { PostCardSkeleton } from '@/organisms/PostCardSkeleton/PostCardSkeleton';

const GRID_SKELETON_COUNT = 6;

/**
 * GridPostsSkeleton
 *
 * Initial-load placeholder for `TimelineGridPosts` — the same `PostCardSkeleton`
 * used by the vertical timeline, arranged in the shared responsive card grid.
 *
 * Each cell is a named `@container/grid` (matching `TimelineGridPosts`) so the
 * card's grid-scoped `@max-xl/grid:*!` overrides fire here too — the skeleton's
 * tags/actions row stacks exactly like the rendered card (decision D4).
 */
export function GridPostsSkeleton() {
  return (
    <Container
      data-cy="timeline-container"
      overrideDefaults
      className={cn('grid', GRID_FEED_GAP_CLASS, GRID_FEED_COLUMNS_CLASS)}
    >
      {Array.from({ length: GRID_SKELETON_COUNT }).map((_, i) => (
        <Container key={`grid-skeleton-${i}`} overrideDefaults className="@container/grid">
          <PostCardSkeleton />
        </Container>
      ))}
    </Container>
  );
}
