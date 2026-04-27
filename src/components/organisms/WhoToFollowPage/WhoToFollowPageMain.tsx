'use client';

import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import * as Core from '@/core';
import { USERS_PER_PAGE } from './WhoToFollowPageMain.constants';
import { Users } from 'lucide-react';
const LOAD_MORE_SKELETON_COUNT = 2;

/**
 * WhoToFollowPageMain
 *
 * Main content component for the Who To Follow page.
 * Displays recommended users with infinite scroll pagination.
 */
export function WhoToFollowPageMain() {
  const currentUserPubky = Core.useAuthStore((state) => state.currentUserPubky);
  const { users, isLoading, isLoadingMore, hasMore, loadMore } = Hooks.useUserStream({
    streamId: Core.UserStreamTypes.RECOMMENDED,
    limit: USERS_PER_PAGE,
    paginated: true,
    includeRelationships: true,
    includeCounts: true,
  });
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
        <Atoms.Container className="gap-3.5 rounded-md bg-transparent p-0 lg:gap-3 lg:bg-card lg:p-6">
          {Array.from({
            length: USERS_PER_PAGE,
          }).map((_, index) => (
            <Organisms.FullUserListItemSkeleton key={`who-to-follow-page-skeleton-${index}`} />
          ))}
        </Atoms.Container>
      </Atoms.Container>
    );
  }
  if (users.length === 0) {
    return (
      <Atoms.Container data-testid="who-to-follow-empty" className="relative mt-6 items-center gap-6 px-0 py-6 lg:mt-0">
        {/* Icon */}
        <Atoms.Container overrideDefaults className="flex items-center rounded-full bg-brand/16 p-6">
          <Users className="size-12 text-brand" strokeWidth={1.5} />
        </Atoms.Container>

        {/* Title and subtitle */}
        <Atoms.Container className="items-center gap-6">
          <Atoms.Typography as="h3" size="lg">
            No recommendations yet
          </Atoms.Typography>
          <Atoms.Typography className="text-center text-base leading-6 font-medium text-secondary-foreground">
            We&apos;re still learning about your interests.
            <br />
            Follow some users or explore tags to get personalized recommendations.
          </Atoms.Typography>
        </Atoms.Container>
      </Atoms.Container>
    );
  }
  return (
    <Atoms.Container data-cy="who-to-follow-page" className="mt-6 gap-4 lg:mt-0">
      <Atoms.Container className="gap-3.5 rounded-md bg-transparent p-0 lg:gap-3 lg:bg-card lg:p-6">
        {users.map((user) => (
          <Organisms.UserListItem
            key={user.id}
            user={user}
            variant="full"
            isLoading={isUserLoading(user.id)}
            isStatusLoading={isLoading}
            isCurrentUser={currentUserPubky === user.id}
            onFollowClick={handleFollow}
          />
        ))}
      </Atoms.Container>

      {/* Infinite scroll trigger */}
      <Atoms.Container overrideDefaults ref={sentinelRef} className="h-1" />

      {isLoadingMore && (
        <Atoms.Container className="gap-4 py-4">
          {Array.from({
            length: LOAD_MORE_SKELETON_COUNT,
          }).map((_, i) => (
            <Organisms.FullUserListItemSkeleton key={`who-to-follow-load-more-skeleton-${i}`} />
          ))}
        </Atoms.Container>
      )}
    </Atoms.Container>
  );
}
