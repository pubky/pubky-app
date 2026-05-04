'use client';

import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useUserStream } from '@/hooks/useUserStream/useUserStream';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { FullUserListItemSkeleton } from '../FullUserListItemSkeleton/FullUserListItemSkeleton';
import { UserListItem } from '../UserListItem/UserListItem';

import { APP_ROUTES } from '@/app/routes';
import type { HotActiveUsersProps } from './HotActiveUsers.types';
import { cn } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import type { UserStreamId } from '@/models/stream/user/userStream.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useHotStore } from '@/stores/hot/hot.store';
const DEFAULT_USERS_LIMIT = 10;

/**
 * Get the user stream ID based on reach and timeframe filters.
 * Uses influencers source with dynamic reach/timeframe from hot store.
 * Pattern: influencers:timeframe:reach
 */
function useActiveUsersStreamId(): UserStreamId {
  const reach = useHotStore((state) => state.reach);
  const timeframe = useHotStore((state) => state.timeframe);

  const streamId = useMemo(() => {
    // Build influencers stream ID: influencers:timeframe:reach
    return `influencers:${timeframe}:${reach}` as UserStreamId;
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
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const streamId = useActiveUsersStreamId();

  const { users, isLoading, error } = useUserStream({
    streamId,
    limit,
    includeCounts: true,
    includeRelationships: true,
    includeTags: true,
  });

  const { toggleFollow, isUserLoading } = useFollowUser();

  const handleUserClick = (pubky: Pubky) => {
    router.push(`${APP_ROUTES.PROFILE}/${pubky}`);
  };

  const handleFollowClick = async (userId: Pubky, isCurrentlyFollowing: boolean) => {
    await toggleFollow(userId, isCurrentlyFollowing);
  };

  return (
    <Container overrideDefaults className={cn('flex w-full flex-col gap-2', className)} data-testid="hot-active-users">
      <Heading level={5} size="lg" className="font-light text-muted-foreground">
        {t('activeUsers')}
      </Heading>
      {error ? (
        <Typography className="text-destructive">{t('failedToLoadUsers')}</Typography>
      ) : isLoading ? (
        <Container className="gap-3.5 rounded-md py-2 lg:gap-3">
          {Array.from({ length: limit }).map((_, index) => (
            <FullUserListItemSkeleton key={`hot-active-users-skeleton-${index}`} />
          ))}
        </Container>
      ) : users.length === 0 ? (
        <Typography className="font-light text-muted-foreground">{t('noUsersToShow')}</Typography>
      ) : (
        <Container className="gap-3.5 rounded-md py-2 lg:gap-3">
          {users.map((user) => (
            <UserListItem
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
        </Container>
      )}
    </Container>
  );
}
