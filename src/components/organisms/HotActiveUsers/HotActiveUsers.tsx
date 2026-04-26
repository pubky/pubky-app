'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import * as Core from '@/core';
import { APP_ROUTES } from '@/app/routes';
import type { HotActiveUsersProps } from './HotActiveUsers.types';
import { cn } from '@/libs/utils/utils';

const DEFAULT_USERS_LIMIT = 10;

/**
 * Get the user stream ID based on reach and timeframe filters.
 * Uses influencers source with dynamic reach/timeframe from hot store.
 * Pattern: influencers:timeframe:reach
 */
function useActiveUsersStreamId(): Core.UserStreamId {
  const reach = Core.useHotStore((state) => state.reach);
  const timeframe = Core.useHotStore((state) => state.timeframe);

  const streamId = useMemo(() => {
    // Build influencers stream ID: influencers:timeframe:reach
    return `influencers:${timeframe}:${reach}` as Core.UserStreamId;
  }, [reach, timeframe]);

  return streamId;
}

/**
 * HotActiveUsers
 *
 * Organism that displays active/influential users in a full list format.
 * Uses influencers stream with reach and timeframe filters from hot store.
 * - ALL: Influencers across all users
 * - FOLLOWING: Influencers among people the current user follows
 * - FRIENDS: Influencers among the current user's friends
 */
export function HotActiveUsers({ limit = DEFAULT_USERS_LIMIT, className }: HotActiveUsersProps) {
  const t = useTranslations('hot');
  const router = useRouter();
  const currentUserPubky = Core.useAuthStore((state) => state.currentUserPubky);
  const streamId = useActiveUsersStreamId();

  const { users, isLoading, error } = Hooks.useUserStream({
    streamId,
    limit,
    includeCounts: true,
    includeRelationships: true,
    includeTags: true,
  });

  const { toggleFollow, isUserLoading } = Hooks.useFollowUser();

  const handleUserClick = (pubky: Core.Pubky) => {
    router.push(`${APP_ROUTES.PROFILE}/${pubky}`);
  };

  const handleFollowClick = async (userId: Core.Pubky, isCurrentlyFollowing: boolean) => {
    await toggleFollow(userId, isCurrentlyFollowing);
  };

  return (
    <Atoms.Container
      overrideDefaults
      className={cn('flex w-full flex-col gap-2', className)}
      data-testid="hot-active-users"
    >
      <Atoms.Heading level={5} size="lg" className="font-light text-muted-foreground">
        {t('activeUsers')}
      </Atoms.Heading>
      {error ? (
        <Atoms.Typography className="text-destructive">{t('failedToLoadUsers')}</Atoms.Typography>
      ) : isLoading ? (
        <Atoms.Container className="gap-3.5 rounded-md py-2 lg:gap-3">
          {Array.from({ length: limit }).map((_, index) => (
            <Organisms.FullUserListItemSkeleton key={`hot-active-users-skeleton-${index}`} />
          ))}
        </Atoms.Container>
      ) : users.length === 0 ? (
        <Atoms.Typography className="font-light text-muted-foreground">{t('noUsersToShow')}</Atoms.Typography>
      ) : (
        <Atoms.Container className="gap-3.5 rounded-md py-2 lg:gap-3">
          {users.map((user) => (
            <Organisms.UserListItem
              key={user.id}
              user={user}
              variant="full"
              isLoading={isUserLoading(user.id)}
              isStatusLoading={isLoading}
              isCurrentUser={currentUserPubky === user.id}
              onUserClick={handleUserClick}
              onFollowClick={handleFollowClick}
            />
          ))}
        </Atoms.Container>
      )}
    </Atoms.Container>
  );
}
