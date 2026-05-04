'use client';

import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { useUserStream } from '@/hooks/useUserStream/useUserStream';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { FullUserListItemSkeleton } from '../FullUserListItemSkeleton/FullUserListItemSkeleton';
import { UserListItem } from '../UserListItem/UserListItem';

import { USERS_PER_PAGE } from './WhoToFollowPageMain.constants';
import { Users } from 'lucide-react';
import type { Pubky } from '@/models/models.types';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { useAuthStore } from '@/stores/auth/auth.store';
const LOAD_MORE_SKELETON_COUNT = 2;

/**
 * WhoToFollowPageMain
 *
 * Main content component for the Who To Follow page.
 * Displays recommended users with infinite scroll pagination.
 */
export function WhoToFollowPageMain() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const { users, isLoading, isLoadingMore, hasMore, loadMore } = useUserStream({
    streamId: UserStreamTypes.RECOMMENDED,
    limit: USERS_PER_PAGE,
    paginated: true,
    includeRelationships: true,
    includeCounts: true,
  });
  const { toggleFollow, isUserLoading } = useFollowUser();

  // Handle infinite scroll
  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading: isLoadingMore,
  });

  // Handle follow/unfollow action
  const handleFollow = async (userId: Pubky, isCurrentlyFollowing: boolean) => {
    await toggleFollow(userId, isCurrentlyFollowing);
  };
  if (isLoading) {
    return (
      <Container className="mt-6 gap-4 lg:mt-0">
        <Container className="gap-3.5 rounded-md bg-transparent p-0 lg:gap-3 lg:bg-card lg:p-6">
          {Array.from({
            length: USERS_PER_PAGE,
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
            onFollowClick={handleFollow}
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
