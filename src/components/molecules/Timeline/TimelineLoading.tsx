'use client';

import * as Atoms from '@/atoms';
import { PostCardSkeleton } from '@/organisms/PostCardSkeleton/PostCardSkeleton';

const TIMELINE_SKELETON_COUNT = 3;

/**
 * TimelineLoading
 *
 * Loading indicator for initial timeline load.
 */
export function TimelineLoading() {
  return (
    <Atoms.Container data-cy="timeline-container" className="gap-4">
      {Array.from({ length: TIMELINE_SKELETON_COUNT }).map((_, i) => (
        <PostCardSkeleton key={`timeline-skeleton-${i}`} />
      ))}
    </Atoms.Container>
  );
}
