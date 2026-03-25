'use client';

import * as Atoms from '@/atoms';
import { PostCardSkeleton } from '@/organisms/PostCardSkeleton/PostCardSkeleton';

const TIMELINE_LOAD_MORE_SKELETON_COUNT = 2;

/**
 * TimelineLoadingMore
 *
 * Loading indicator for when more posts are being fetched.
 */
export function TimelineLoadingMore() {
  return (
    <Atoms.Container className="gap-4 py-4">
      {Array.from({ length: TIMELINE_LOAD_MORE_SKELETON_COUNT }).map((_, i) => (
        <PostCardSkeleton key={`timeline-load-more-skeleton-${i}`} />
      ))}
    </Atoms.Container>
  );
}
