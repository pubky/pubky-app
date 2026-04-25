'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Core from '@/core';
import * as Hooks from '@/hooks';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import { APP_ROUTES } from '@/app/routes';
import { UsersRound } from 'lucide-react';
const USERS_LIMIT = 3;

/**
 * ActiveUsers
 *
 * Sidebar section showing active users (influencers) with their post/tag counts.
 * Uses SidebarSection and UserListItem for consistent layout.
 *
 * Note: This is an Organism because it interacts with Core via hooks (useUserStream, useFollowUser).
 */
export function ActiveUsers() {
  const t = useTranslations('sidebar');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { users, isLoading: isStreamLoading } = Hooks.useUserStream({
    streamId: Core.UserStreamTypes.TODAY_INFLUENCERS_ALL,
    limit: USERS_LIMIT,
    includeCounts: true,
    includeRelationships: true,
  });
  const { toggleFollow, isUserLoading } = Hooks.useFollowUser();
  const handleUserClick = (pubky: Core.Pubky) => {
    router.push(`${APP_ROUTES.PROFILE}/${pubky}`);
  };
  const handleFollowClick = async (userId: Core.Pubky, isFollowing: boolean) => {
    await toggleFollow(userId, isFollowing);
  };
  const handleSeeAll = () => {
    router.push(`${APP_ROUTES.HOT}`);
  };
  return (
    <Molecules.SidebarSection
      title={t('activeUsers')}
      footerIcon={UsersRound}
      footerText={tCommon('seeAll')}
      onFooterClick={handleSeeAll}
      data-testid="active-users"
    >
      {isStreamLoading ? (
        Array.from({
          length: USERS_LIMIT,
        }).map((_, index) => <Organisms.CompactUserListItemSkeleton key={`active-users-skeleton-${index}`} />)
      ) : users.length === 0 ? (
        <Atoms.Typography className="font-light text-muted-foreground">{t('noUsers')}</Atoms.Typography>
      ) : (
        users.map((user) => (
          <Organisms.UserListItem
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
    </Molecules.SidebarSection>
  );
}
