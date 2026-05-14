'use client';

import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { NEXUS_USERS_PER_PAGE } from '@/config/nexus';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { useProfileConnections } from '@/hooks/useProfileConnections/useProfileConnections';
import { CONNECTION_TYPE } from '@/hooks/useProfileConnections/useProfileConnections.types';
import type { Pubky } from '@/models/models.types';
import { FriendsEmpty } from '@/molecules/FriendsEmpty/FriendsEmpty';
import { useProfileContext } from '@/providers/ProfileProvider/ProfileProvider';
import { useAuthStore } from '@/stores/auth/auth.store';
import { FullUserListItemSkeleton } from '../FullUserListItemSkeleton/FullUserListItemSkeleton';
import { UserListItem } from '../UserListItem/UserListItem';

const LOAD_MORE_SKELETON_COUNT = 2;

/**
 * ProfileFriends
 *
 * Organism that displays a user's friends list with infinite scroll pagination.
 * Handles data fetching, loading states, and follow/unfollow actions.
 * Uses ProfileContext to get the target user's pubky.
 *
 * Note: Friends are by definition mutual follows, so isFollowing is always true.
 */
export function ProfileFriends() {
  // Get the profile pubky from context
  const { pubky } = useProfileContext();
  // Get the current logged-in user's pubky
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);

  const { connections, count, isLoading, isLoadingMore, hasMore, loadMore } = useProfileConnections(
    CONNECTION_TYPE.FRIENDS,
    pubky ?? undefined,
  );
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
        <Heading level={5} size="lg" className="leading-normal font-light text-muted-foreground lg:hidden">
          Friends
        </Heading>
        <Container
          data-cy="profile-connections-list"
          className="gap-3.5 rounded-md bg-transparent p-0 lg:gap-3 lg:bg-card lg:p-6"
        >
          {Array.from({ length: NEXUS_USERS_PER_PAGE }).map((_, index) => (
            <FullUserListItemSkeleton key={`profile-friends-skeleton-${index}`} />
          ))}
        </Container>
      </Container>
    );
  }

  if (connections.length === 0) {
    return (
      <Container className="mt-6 lg:mt-0">
        <FriendsEmpty />
      </Container>
    );
  }

  return (
    <Container className="mt-6 gap-4 lg:mt-0">
      <Heading level={5} size="lg" className="leading-normal font-light text-muted-foreground lg:hidden">
        Friends {count > 0 && `(${count})`}
      </Heading>
      <Container
        data-cy="profile-connections-list"
        className="gap-3.5 rounded-md bg-transparent p-0 lg:gap-3 lg:bg-card lg:p-6"
      >
        {connections.map((connection) => (
          <UserListItem
            key={connection.id}
            user={connection}
            variant="full"
            followButtonVariant="icon"
            isLoading={isUserLoading(connection.id)}
            isStatusLoading={isLoading}
            isCurrentUser={currentUserPubky === connection.id}
            onFollowClick={handleFollow}
          />
        ))}
      </Container>

      {/* Infinite scroll trigger */}
      <div ref={sentinelRef} className="h-1" />

      {isLoadingMore && (
        <Container className="gap-4 py-4">
          {Array.from({ length: LOAD_MORE_SKELETON_COUNT }).map((_, i) => (
            <FullUserListItemSkeleton key={`friends-load-more-skeleton-${i}`} />
          ))}
        </Container>
      )}
    </Container>
  );
}
