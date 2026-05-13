'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { APP_ROUTES } from '@/app/routes';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useUserStream } from '@/hooks/useUserStream/useUserStream';
import {
  WHO_TO_FOLLOW_BUFFER_SIZE,
  WHO_TO_FOLLOW_REFILL_THRESHOLD,
  WHO_TO_FOLLOW_USER_LIMIT,
} from '@/hooks/useUserStream/useUserStream.constants';
import type { Pubky } from '@/models/models.types';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { SidebarSection } from '@/molecules/SidebarSection/SidebarSection';
import { CompactUserListItemSkeleton } from '@/organisms/CompactUserListItemSkeleton/CompactUserListItemSkeleton';
import { UserListItem } from '@/organisms/UserListItem/UserListItem';

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
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);
  const [recentlyFollowedUserIds, setRecentlyFollowedUserIds] = useState<Pubky[]>([]);
  const { users, isLoading: isStreamLoading } = useUserStream({
    streamId: UserStreamTypes.RECOMMENDED,
    limit: WHO_TO_FOLLOW_USER_LIMIT,
    bufferSize: WHO_TO_FOLLOW_BUFFER_SIZE,
    refillThreshold: WHO_TO_FOLLOW_REFILL_THRESHOLD,
    includeRelationships: true,
    excludeFollowing: true,
    preserveFollowedUserIds: recentlyFollowedUserIds,
  });
  const { toggleFollow, isUserLoading } = useFollowUser();

  useEffect(() => {
    if (previousPathnameRef.current === pathname) return;

    previousPathnameRef.current = pathname;
    setRecentlyFollowedUserIds([]);
  }, [pathname]);

  const handleUserClick = (pubky: Pubky) => {
    router.push(`${APP_ROUTES.PROFILE}/${pubky}`);
  };
  const handleFollowClick = async (userId: Pubky, isFollowing: boolean) => {
    const updatePreservedUserIds = () =>
      setRecentlyFollowedUserIds((prev) => {
        if (isFollowing) {
          return prev.filter((id) => id !== userId);
        }
        return prev.includes(userId) ? prev : [...prev, userId];
      });

    updatePreservedUserIds();

    try {
      await toggleFollow(userId, isFollowing);
    } catch (err) {
      if (isFollowing) {
        setRecentlyFollowedUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
      } else {
        setRecentlyFollowedUserIds((prev) => prev.filter((id) => id !== userId));
      }
      throw err;
    }
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
            length: WHO_TO_FOLLOW_USER_LIMIT,
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
