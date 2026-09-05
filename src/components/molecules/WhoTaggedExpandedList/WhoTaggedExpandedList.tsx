'use client';

import { useRouter } from 'next/navigation';
import { getUserProfileUrl } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { useBulkUserAvatars } from '@/hooks/useBulkUserAvatars/useBulkUserAvatars';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import type { TaggerWithAvatar } from '@/molecules/TaggedItem/TaggedItem.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { TaggerUserRow } from '../TaggerUserRow/TaggerUserRow';
import { TaggerRowSkeleton, WhoTaggedExpandedListSkeleton } from './WhoTaggedExpandedList.skeleton';
import type { WhoTaggedExpandedListProps } from './WhoTaggedExpandedList.types';

/**
 * WhoTaggedExpandedList
 *
 * Displays an expandable list of users who tagged a post/content.
 * Shows each user with their avatar, name, pubky, and a follow/unfollow button.
 * Max height of 300px with scroll for overflow; scrolling to the bottom loads
 * the next page when `hasMore` is set.
 */
export function WhoTaggedExpandedList({
  taggerIds,
  fallbackTaggers,
  isLoadingTaggers,
  isLoadingMore = false,
  hasMore = false,
  hasError = false,
  onLoadMore,
  'data-testid': dataTestId,
}: WhoTaggedExpandedListProps) {
  const router = useRouter();
  const { toggleFollow, isUserLoading } = useFollowUser();
  const { requireAuth } = useRequireAuth();
  const { currentUserPubky } = useAuthStore();
  const { getUsersWithAvatars } = useBulkUserAvatars(taggerIds);
  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: onLoadMore || (() => {}),
    hasMore: hasMore && !hasError && !!onLoadMore,
    isLoading: isLoadingMore,
    threshold: 100,
    debounceMs: 300,
  });

  // Build fallback map for user data not yet in IndexedDB
  const fallbackMap = new Map<string, TaggerWithAvatar>();
  (fallbackTaggers ?? []).forEach((tagger) => {
    fallbackMap.set(tagger.id, tagger);
  });

  // Merge user data from IndexedDB with fallback data
  const taggers = getUsersWithAvatars(taggerIds).map((tagger) => {
    const fallback = fallbackMap.get(tagger.id);
    return {
      id: tagger.id,
      name: tagger.name ?? fallback?.name,
      avatarUrl: tagger.avatarUrl ?? fallback?.avatarUrl ?? '',
    };
  });

  const handleFollowClick = (userId: string, isFollowing: boolean, displayName: string) => {
    requireAuth(() => toggleFollow(userId, isFollowing, displayName));
  };

  const handleUserClick = (userId: string) => {
    router.push(getUserProfileUrl(userId, currentUserPubky));
  };

  if (taggerIds.length === 0 && !isLoadingTaggers && !hasError) {
    return null;
  }

  if (isLoadingTaggers) {
    return <WhoTaggedExpandedListSkeleton />;
  }

  return (
    <Container
      aria-label="Who tagged expanded list"
      role="list"
      overrideDefaults
      className="flex max-h-(--who-tagged-expanded-list-max-height) w-full max-w-(--who-tagged-expanded-list-width) flex-col gap-2 overflow-y-auto rounded-md border border-border bg-popover p-4 shadow-2xl"
      data-testid={dataTestId || 'who-tagged-expanded-list'}
    >
      {taggers.map((tagger) => (
        <TaggerUserRow
          key={tagger.id}
          tagger={tagger}
          isLoading={isUserLoading(tagger.id)}
          isCurrentUser={tagger.id === currentUserPubky}
          onUserClick={handleUserClick}
          onFollowClick={handleFollowClick}
        />
      ))}
      {hasError && onLoadMore && (
        <Button variant="secondary" onClick={onLoadMore}>
          Retry loading taggers
        </Button>
      )}
      {hasMore && !hasError && (
        <Container
          overrideDefaults
          ref={sentinelRef}
          className="min-h-px w-full shrink-0"
          data-testid="who-tagged-expanded-list-sentinel"
        >
          {isLoadingMore && <TaggerRowSkeleton />}
        </Container>
      )}
    </Container>
  );
}
