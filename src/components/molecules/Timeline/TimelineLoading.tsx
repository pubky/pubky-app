'use client';
import { Container } from '@/atoms/Container/Container';

import { PostCardSkeleton } from '@/organisms/PostCardSkeleton/PostCardSkeleton';

const TIMELINE_SKELETON_COUNT = 3;

/**
 * TimelineLoading
 *
 * Loading indicator for initial timeline load.
 */
export function TimelineLoading() {
  return (
    <Container data-cy="timeline-container" className="gap-4">
      {Array.from({ length: TIMELINE_SKELETON_COUNT }).map((_, i) => (
        <PostCardSkeleton key={`timeline-skeleton-${i}`} />
      ))}
    </Container>
  );
}
