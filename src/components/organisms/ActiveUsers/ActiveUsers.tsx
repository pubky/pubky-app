'use client';

import { useRouter } from 'next/navigation';
import { UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { APP_ROUTES } from '@/app/routes';
import { Typography } from '@/atoms/Typography/Typography';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useUserStream } from '@/hooks/useUserStream/useUserStream';
import type { Pubky } from '@/models/models.types';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { SidebarSection } from '@/molecules/SidebarSection/SidebarSection';
import { CompactUserListItemSkeleton } from '../CompactUserListItemSkeleton/CompactUserListItemSkeleton';
import { UserListItem } from '../UserListItem/UserListItem';

const USERS_LIMIT = 3;

/**
 * ActiveUsers
 *
 * Sidebar section showing active users (influencers) with their post/tag counts.
 * Uses SidebarSection and UserListItem for consistent layout.
 *
 * Note: This is an Organism because it interacts with data hooks (useUserStream, useFollowUser).
 */
export function ActiveUsers() {
  const t = useTranslations('sidebar');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { users, isLoading: isStreamLoading } = useUserStream({
    streamId: UserStreamTypes.TODAY_INFLUENCERS_ALL,
    limit: USERS_LIMIT,
    includeCounts: true,
    includeRelationships: true,
  });
  const { toggleFollow, isUserLoading } = useFollowUser();
  const handleUserClick = (pubky: Pubky) => {
    router.push(`${APP_ROUTES.PROFILE}/${pubky}`);
  };
  const handleFollowClick = async (userId: Pubky, isFollowing: boolean) => {
    await toggleFollow(userId, isFollowing);
  };
  const handleSeeAll = () => {
    router.push(`${APP_ROUTES.HOT}`);
  };
  return (
    <SidebarSection
      title={t('activeUsers')}
      footerIcon={UsersRound}
      footerText={tCommon('seeAll')}
      onFooterClick={handleSeeAll}
      data-testid="active-users"
    >
      {isStreamLoading ? (
        Array.from({
          length: USERS_LIMIT,
        }).map((_, index) => <CompactUserListItemSkeleton key={`active-users-skeleton-${index}`} />)
      ) : users.length === 0 ? (
        <Typography className="font-light text-muted-foreground">{t('noUsers')}</Typography>
      ) : (
        users.map((user) => (
          <UserListItem
            key={user.id}
            user={user}
            variant="compact"
            showStats
            isLoading={isUserLoading(user.id)}
            isStatusLoading={isStreamLoading}
            onUserClick={handleUserClick}
            onFollowClick={handleFollowClick}
          />
        ))
      )}
    </SidebarSection>
  );
}
