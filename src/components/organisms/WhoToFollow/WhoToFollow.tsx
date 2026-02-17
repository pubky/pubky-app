'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as Core from '@/core';
import * as Hooks from '@/hooks';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import { APP_ROUTES } from '@/app/routes';
import type { WhoToFollowProps } from './WhoToFollow.types';
import { USERS_LIMIT } from './WhoToFollow.constants';

/**
 * WhoToFollow
 *
 * Sidebar section showing recommended users to follow.
 * Uses SidebarSection and UserListItem for consistent layout.
 *
 * Note: This is an Organism because it interacts with Core via hooks (useUserStream, useFollowUser).
 */
export function WhoToFollow({ className }: WhoToFollowProps) {
  const t = useTranslations('sidebar');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { users, isLoading: isStreamLoading } = Hooks.useUserStream({
    streamId: Core.UserStreamTypes.RECOMMENDED,
    limit: USERS_LIMIT,
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
    router.push(APP_ROUTES.WHO_TO_FOLLOW);
  };

  return (
    <Molecules.SidebarSection
      title={t('whoToFollow')}
      footerIcon={Libs.Users}
      footerText={tCommon('seeAll')}
      onFooterClick={handleSeeAll}
      className={className}
      data-testid="who-to-follow"
    >
      {isStreamLoading
        ? Array.from({ length: USERS_LIMIT }).map((_, index) => (
            <Organisms.CompactUserListItemSkeleton key={`who-to-follow-skeleton-${index}`} />
          ))
        : users.map((user) => (
            <Organisms.UserListItem
              key={user.id}
              user={user}
              variant="compact"
              isLoading={isUserLoading(user.id)}
              isStatusLoading={isStreamLoading}
              onUserClick={handleUserClick}
              onFollowClick={handleFollowClick}
            />
          ))}
    </Molecules.SidebarSection>
  );
}
