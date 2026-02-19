'use client';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import * as Core from '@/core';
import * as Providers from '@/providers';
import { NEXUS_USERS_PER_PAGE } from '@/config';

/**
 * ProfileFollowers
 *
 * Organism that displays a user's followers list with infinite scroll pagination.
 * Handles data fetching, loading states, and follow/unfollow actions.
 * Uses ProfileContext to get the target user's pubky.
 */
export function ProfileFollowers() {
  // Get the profile pubky from context
  const { pubky } = Providers.useProfileContext();
  // Get the current logged-in user's pubky
  const currentUserPubky = Core.useAuthStore((state) => state.currentUserPubky);

  const { connections, count, isLoading, isLoadingMore, hasMore, loadMore } = Hooks.useProfileConnections(
    Hooks.CONNECTION_TYPE.FOLLOWERS,
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
      <Atoms.Container data-cy="profile-followers-list" className="mt-6 gap-4 lg:mt-0">
        <Atoms.Heading level={5} size="lg" className="leading-normal font-light text-muted-foreground lg:hidden">
          Followers
        </Atoms.Heading>
        <Atoms.Container
          data-cy="profile-connections-list"
          className="gap-3.5 rounded-md bg-transparent p-0 lg:gap-3 lg:bg-card lg:p-6"
        >
          {Array.from({ length: NEXUS_USERS_PER_PAGE }).map((_, index) => (
            <Organisms.FullUserListItemSkeleton key={`profile-followers-skeleton-${index}`} />
          ))}
        </Atoms.Container>
      </Atoms.Container>
    );
  }

  if (connections.length === 0) {
    return (
      <Atoms.Container className="mt-6 lg:mt-0">
        <Molecules.FollowersEmpty />
      </Atoms.Container>
    );
  }

  return (
    <Atoms.Container data-cy="profile-followers-list" className="mt-6 gap-4 lg:mt-0">
      <Atoms.Heading level={5} size="lg" className="leading-normal font-light text-muted-foreground lg:hidden">
        Followers {count > 0 && `(${count})`}
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
            isLoading={isUserLoading(connection.id)}
            isStatusLoading={isLoading}
            isCurrentUser={currentUserPubky === connection.id}
            onFollowClick={handleFollow}
          />
        ))}
      </Atoms.Container>

      {/* Infinite scroll trigger */}
      <div ref={sentinelRef} className="h-1" />

      {/* Loading more indicator */}
      {isLoadingMore && (
        <Atoms.Container className="flex justify-center py-4">
          <Atoms.Spinner />
        </Atoms.Container>
      )}
    </Atoms.Container>
  );
}
