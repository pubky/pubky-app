'use client';

import { useRouter } from 'next/navigation';
import { getUserProfileUrl } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useBulkUserAvatars } from '@/hooks/useBulkUserAvatars/useBulkUserAvatars';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import type { Pubky } from '@/models/models.types';
import type { TaggerWithAvatar } from '@/molecules/TaggedItem/TaggedItem.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { TaggerUserRow } from '../TaggerUserRow/TaggerUserRow';
import { TaggerRowSkeleton, WhoTaggedExpandedListSkeleton } from './WhoTaggedExpandedList.skeleton';
import type { WhoTaggedExpandedListProps } from './WhoTaggedExpandedList.types';

const NO_TAGGERS: Pubky[] = [];

/**
 * WhoTaggedExpandedList
 *
 * Displays an expandable list of users who tagged a post/content.
 * Shows each user with their avatar, name, pubky, and a follow/unfollow button.
 * Max height of 300px with scroll for overflow; scrolling to the bottom loads
 * the next page when `hasMore` is set. Optionally a second group after a thin
 * rule (`secondaryTaggerIds`), something after each name (`renderTaggerAside`)
 * and "+N" for people counted but not listed (`moreCount`).
 */
export function WhoTaggedExpandedList({
  taggerIds,
  fallbackTaggers,
  isLoadingTaggers,
  isLoadingMore = false,
  hasMore = false,
  hasError = false,
  onLoadMore,
  secondaryTaggerIds = NO_TAGGERS,
  groupNames,
  renderTaggerAside,
  moreCount = 0,
  'data-testid': dataTestId,
}: WhoTaggedExpandedListProps) {
  const router = useRouter();
  const { toggleFollow, isUserLoading } = useFollowUser();
  const { requireAuth } = useRequireAuth();
  const { currentUserPubky } = useAuthStore();
  // The same ids as before when there is no second group, so the user details read keeps its input.
  const allTaggerIds = secondaryTaggerIds.length > 0 ? [...taggerIds, ...secondaryTaggerIds] : taggerIds;
  const { getUsersWithAvatars } = useBulkUserAvatars(allTaggerIds);
  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: onLoadMore || (() => {}),
    hasMore: hasMore && !hasError && !!onLoadMore,
    isLoading: isLoadingMore || !!isLoadingTaggers,
    threshold: 100,
    debounceMs: 300,
  });

  // Build fallback map for user data not yet in IndexedDB
  const fallbackMap = new Map<string, TaggerWithAvatar>();
  (fallbackTaggers ?? []).forEach((tagger) => {
    fallbackMap.set(tagger.id, tagger);
  });

  // Merge user data from IndexedDB with fallback data
  const people = new Map(
    getUsersWithAvatars(allTaggerIds).map((tagger) => {
      const fallback = fallbackMap.get(tagger.id);
      return [
        tagger.id,
        {
          id: tagger.id,
          name: tagger.name ?? fallback?.name,
          avatarUrl: tagger.avatarUrl ?? fallback?.avatarUrl ?? '',
        },
      ];
    }),
  );
  const withDetails = (ids: Pubky[]) => ids.flatMap((id) => people.get(id) ?? []);
  const taggers = withDetails(taggerIds);
  const secondaryTaggers = withDetails(secondaryTaggerIds);

  const handleFollowClick = (userId: string, isFollowing: boolean) => {
    requireAuth(() => toggleFollow(userId, isFollowing));
  };

  const handleUserClick = (userId: string) => {
    router.push(getUserProfileUrl(userId, currentUserPubky));
  };

  const renderRow = (tagger: TaggerWithAvatar) => (
    <TaggerUserRow
      key={tagger.id}
      tagger={tagger}
      isLoading={isUserLoading(tagger.id)}
      isCurrentUser={tagger.id === currentUserPubky}
      onUserClick={handleUserClick}
      onFollowClick={handleFollowClick}
      nameAside={renderTaggerAside?.(tagger.id)}
    />
  );

  if (taggerIds.length === 0 && secondaryTaggerIds.length === 0 && !isLoadingTaggers && !hasError) {
    return null;
  }

  if (isLoadingTaggers && taggerIds.length === 0 && secondaryTaggerIds.length === 0) {
    return <WhoTaggedExpandedListSkeleton />;
  }

  return (
    <Container
      aria-label="Who tagged expanded list"
      role="list"
      aria-busy={!!isLoadingTaggers || isLoadingMore}
      overrideDefaults
      className="flex max-h-(--who-tagged-expanded-list-max-height) w-full max-w-(--who-tagged-expanded-list-width) flex-col gap-2 overflow-y-auto rounded-md border border-border bg-popover p-4 shadow-2xl"
      data-testid={dataTestId || 'who-tagged-expanded-list'}
    >
      {groupNames && taggers.length > 0 && <span className="sr-only">{groupNames[0]}</span>}
      {taggers.map(renderRow)}
      {secondaryTaggers.length > 0 && (
        <>
          {taggers.length > 0 && (
            <Container
              overrideDefaults
              aria-hidden
              className="border-t border-border"
              data-testid="who-tagged-expanded-list-divider"
            />
          )}
          {groupNames && <span className="sr-only">{groupNames[1]}</span>}
          {secondaryTaggers.map(renderRow)}
        </>
      )}
      {moreCount > 0 && (
        <Typography as="span" size="sm" className="font-normal text-muted-foreground">
          +{moreCount}
          <span className="sr-only"> more, not listed</span>
        </Typography>
      )}
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
