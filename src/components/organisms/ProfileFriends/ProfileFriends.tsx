'use client';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import * as Core from '@/core';
import * as Providers from '@/providers';
import { NEXUS_USERS_PER_PAGE } from '@/config';

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
  const { pubky } = Providers.useProfileContext();
  // Get the current logged-in user's pubky
  const currentUserPubky = Core.useAuthStore((state) => state.currentUserPubky);

  const { connections, count, isLoading, isLoadingMore, hasMore, loadMore } = Hooks.useProfileConnections(
    Hooks.CONNECTION_TYPE.FRIENDS,
    pubky ?? undefined,
  );
  const { toggleFollow, isUserLoading } = Hooks.useFollowUser();

  // Handle infinite scroll
  const { sentinelRef } = Hooks.useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading: isLoadingMore,
  });

  // Handle follow/unfollow action
  const handleFollow = async (userId: Core.Pubky, isCurrentlyFollowing: boolean) => {
    await toggleFollow(userId, isCurrentlyFollowing);
  };

  if (isLoading) {
    return (
      <Atoms.Container className="mt-6 gap-4 lg:mt-0">
        <Atoms.Heading level={5} size="lg" className="leading-normal font-light text-muted-foreground lg:hidden">
          Friends
        </Atoms.Heading>
        <Atoms.Container
          data-cy="profile-connections-list"
          className="gap-3.5 rounded-md bg-transparent p-0 lg:gap-3 lg:bg-card lg:p-6"
        >
          {Array.from({ length: NEXUS_USERS_PER_PAGE }).map((_, index) => (
            <Organisms.FullUserListItemSkeleton key={`profile-friends-skeleton-${index}`} />
          ))}
        </Atoms.Container>
      </Atoms.Container>
    );
  }

  if (connections.length === 0) {
    return (
      <Atoms.Container className="mt-6 lg:mt-0">
        <Molecules.FriendsEmpty />
      </Atoms.Container>
    );
  }

  return (
    <Atoms.Container className="mt-6 gap-4 lg:mt-0">
      <Atoms.Heading level={5} size="lg" className="leading-normal font-light text-muted-foreground lg:hidden">
        Friends {count > 0 && `(${count})`}
      </Atoms.Heading>
      <Atoms.Container
        data-cy="profile-connections-list"
        className="gap-3.5 rounded-md bg-transparent p-0 lg:gap-3 lg:bg-card lg:p-6"
      >
        {connections.map((connection) => (
          <Organisms.UserListItem
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
      </Atoms.Container>

      {/* Infinite scroll trigger */}
      <div ref={sentinelRef} className="h-1" />

      {isLoadingMore && (
        <Atoms.Container className="gap-4 py-4">
          {Array.from({ length: LOAD_MORE_SKELETON_COUNT }).map((_, i) => (
            <Organisms.FullUserListItemSkeleton key={`friends-load-more-skeleton-${i}`} />
          ))}
        </Atoms.Container>
      )}
    </Atoms.Container>
  );
}
