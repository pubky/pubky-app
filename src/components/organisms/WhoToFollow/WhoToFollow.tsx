'use client';

import { Users } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { useUserStream } from '@/hooks/useUserStream/useUserStream';
import { WHO_TO_FOLLOW_PAGE_SIZE } from '@/hooks/useUserStream/useUserStream.constants';
import { useWhoToFollowFollowPreservation } from '@/hooks/useWhoToFollowFollowPreservation/useWhoToFollowFollowPreservation';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { FullUserListItemSkeleton } from '@/organisms/FullUserListItemSkeleton/FullUserListItemSkeleton';
import { UserListItem } from '@/organisms/UserListItem/UserListItem';
import { useAuthStore } from '@/stores/auth/auth.store';

const LOAD_MORE_SKELETON_COUNT = 2;

/**
 * WhoToFollow
 *
 * Main content component for the Who To Follow page.
 * Displays recommended users with infinite scroll pagination.
 */
export function WhoToFollow() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const { preservedFollowedUserIds, handleFollowClick, isUserLoading } = useWhoToFollowFollowPreservation();
  const { users, isLoading, isLoadingMore, hasMore, loadMore } = useUserStream({
    streamId: UserStreamTypes.RECOMMENDED,
    limit: WHO_TO_FOLLOW_PAGE_SIZE,
    bufferSize: WHO_TO_FOLLOW_PAGE_SIZE,
    refillThreshold: WHO_TO_FOLLOW_PAGE_SIZE,
    paginated: true,
    includeRelationships: true,
    includeCounts: true,
    excludeFollowing: true,
    preserveFollowedUserIds: preservedFollowedUserIds,
  });

  // Handle infinite scroll
  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading: isLoadingMore,
  });
  if (isLoading) {
    return (
      <Container className="mt-6 gap-4 lg:mt-0">
        <Container className="gap-3.5 rounded-md bg-transparent p-0 lg:gap-3 lg:bg-card lg:p-6">
          {Array.from({
            length: WHO_TO_FOLLOW_PAGE_SIZE,
          }).map((_, index) => (
            <FullUserListItemSkeleton key={`who-to-follow-page-skeleton-${index}`} />
          ))}
        </Container>
      </Container>
    );
  }
  if (users.length === 0) {
    return (
      <Container data-testid="who-to-follow-empty" className="relative mt-6 items-center gap-6 px-0 py-6 lg:mt-0">
        {/* Icon */}
        <Container overrideDefaults className="flex items-center rounded-full bg-brand/16 p-6">
          <Users className="size-12 text-brand" strokeWidth={1.5} />
        </Container>

        {/* Title and subtitle */}
        <Container className="items-center gap-6">
          <Typography as="h3" size="lg">
            No recommendations yet
          </Typography>
          <Typography className="text-center text-base leading-6 font-medium text-secondary-foreground">
            We&apos;re still learning about your interests.
            <br />
            Follow some users or explore tags to get personalized recommendations.
          </Typography>
        </Container>
      </Container>
    );
  }
  return (
    <Container data-cy="who-to-follow-page" className="mt-6 gap-4 lg:mt-0">
      <Container className="gap-3.5 rounded-md bg-transparent p-0 lg:gap-3 lg:bg-card lg:p-6">
        {users.map((user) => (
          <UserListItem
            key={user.id}
            user={user}
            variant="full"
            isLoading={isUserLoading(user.id)}
            isStatusLoading={isLoading}
            isCurrentUser={currentUserPubky === user.id}
            onFollowClick={handleFollowClick}
          />
        ))}
      </Container>

      {/* Infinite scroll trigger */}
      <Container overrideDefaults ref={sentinelRef} className="h-1" />

      {isLoadingMore && (
        <Container className="gap-4 py-4">
          {Array.from({
            length: LOAD_MORE_SKELETON_COUNT,
          }).map((_, i) => (
            <FullUserListItemSkeleton key={`who-to-follow-load-more-skeleton-${i}`} />
          ))}
        </Container>
      )}
    </Container>
  );
}
