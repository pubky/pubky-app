'use client';

import { useRouter } from 'next/navigation';
import { UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { APP_ROUTES } from '@/app/routes';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useUserStream } from '@/hooks/useUserStream/useUserStream';
import type { Pubky } from '@/models/models.types';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { SidebarSection } from '@/molecules/SidebarSection/SidebarSection';
import { CompactUserListItemSkeleton } from '../CompactUserListItemSkeleton/CompactUserListItemSkeleton';
import { UserListItem } from '../UserListItem/UserListItem';

const USERS_LIMIT = 3;

/**
 * WhoToFollowSidebar
 *
 * Sidebar section showing recommended users to follow.
 * Uses SidebarSection and UserListItem for consistent layout.
 *
 * Note: This is an Organism because it interacts with data hooks (useUserStream, useFollowUser).
 */
export function WhoToFollowSidebar() {
  const t = useTranslations('sidebar');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { users, isLoading: isStreamLoading } = useUserStream({
    streamId: UserStreamTypes.RECOMMENDED,
    limit: USERS_LIMIT,
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
    router.push(APP_ROUTES.WHO_TO_FOLLOW);
  };
  return (
    <SidebarSection
      title={t('whoToFollow')}
      footerIcon={UsersRound}
      footerText={tCommon('seeAll')}
      onFooterClick={handleSeeAll}
      dataCy="who-to-follow"
      footerDataCy="who-to-follow-see-all"
      data-testid="who-to-follow"
    >
      {isStreamLoading
        ? Array.from({
            length: USERS_LIMIT,
          }).map((_, index) => <CompactUserListItemSkeleton key={`who-to-follow-skeleton-${index}`} />)
        : users.map((user) => (
            <UserListItem
              key={user.id}
              user={user}
              variant="compact"
              isLoading={isUserLoading(user.id)}
              isStatusLoading={isStreamLoading}
              onUserClick={handleUserClick}
              onFollowClick={handleFollowClick}
            />
          ))}
    </SidebarSection>
  );
}
