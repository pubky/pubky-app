'use client';

import { usePostMissing } from '@/hooks/usePostMissing/usePostMissing';
import { isPostDeleted } from '@/libs/utils/utils';
import { PostCardSkeleton } from '@/organisms/PostCardSkeleton/PostCardSkeleton';
import { PostMain } from '@/organisms/PostMain/PostMain';
import type { TUnlockedListItem } from '@/services/locks/locks.types';
import { ProfileUnlockedCard } from './ProfileUnlockedCard';

/**
 * One row of the Unlocked list. The announcement post carries the author, the timestamp and the
 * teaser, and swaps its own lock card for this reader's replica — so rendering it gives the whole
 * row for free. The bare replica is the fallback whenever that post cannot be resolved.
 */
export function ProfileUnlockedItem({
  post,
  announcementPostId,
}: Pick<TUnlockedListItem, 'post' | 'announcementPostId'>) {
  // An item with no announcement passes an id the hook rejects, which settles as missing without a
  // fetch — the same outcome as a post that is gone, and the same fallback.
  const { postMissing, postDetails, isLoading } = usePostMissing(announcementPostId ?? '');

  // A temporary load failure is deliberately not told apart from a deleted post (#2432): both show
  // the content the reader already owns rather than an error.
  if (!announcementPostId || postMissing || isPostDeleted(postDetails?.content)) {
    return <ProfileUnlockedCard post={post} />;
  }

  // `PostMain` runs the same query, so it is mounted only once this one settled: two copies in flight
  // would issue two Nexus requests for one row (#1987).
  if (isLoading) return <PostCardSkeleton />;

  return <PostMain postId={announcementPostId} />;
}
