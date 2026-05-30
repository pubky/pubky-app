'use client';
import { Container } from '@/atoms/Container/Container';
import { PostCardSkeleton } from '@/organisms/PostCardSkeleton/PostCardSkeleton';

const TIMELINE_LOAD_MORE_SKELETON_COUNT = 2;

/**
 * TimelineLoadingMore
 *
 * Loading indicator for when more posts are being fetched.
 */
export function TimelineLoadingMore() {
  return (
    <Container className="gap-4 py-4">
      {Array.from({ length: TIMELINE_LOAD_MORE_SKELETON_COUNT }).map((_, i) => (
        <PostCardSkeleton key={`timeline-load-more-skeleton-${i}`} />
      ))}
    </Container>
  );
}
