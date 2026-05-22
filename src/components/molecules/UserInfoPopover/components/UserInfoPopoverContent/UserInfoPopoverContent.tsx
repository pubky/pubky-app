'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import type { UserConnectionData } from '@/hooks/useProfileConnections/useProfileConnections.types';
import { useUserInfoPopoverActions } from '@/hooks/useUserInfoPopoverActions/useUserInfoPopoverActions';
import { useUserInfoPopoverData } from '@/hooks/useUserInfoPopoverData/useUserInfoPopoverData';
import type { AvatarGroupItem } from '@/molecules/AvatarGroup/AvatarGroup.types';
import { PostText } from '../../../PostText/PostText';
import { UserInfoPopoverFollowButton } from '../UserInfoPopoverFollowButton/UserInfoPopoverFollowButton';
import { UserInfoPopoverHeader } from '../UserInfoPopoverHeader/UserInfoPopoverHeader';
import { UserInfoPopoverStats } from '../UserInfoPopoverStats/UserInfoPopoverStats';
import { UserInfoPopoverSkeleton } from './UserInfoPopoverContent.skeleton';

const MAX_AVATARS = 3;
interface UserInfoPopoverContentProps {
  userId: string;
  userName: string;
  avatarUrl?: string;
  formattedPublicKey: string;
}
function transformConnectionsToAvatarItems(connections: UserConnectionData[], limit: number): AvatarGroupItem[] {
  return connections.slice(0, limit).map((connection) => ({
    id: connection.id,
    name: connection.name,
    avatarUrl: connection.avatarUrl || undefined,
  }));
}
function normalizeStatsValue(statsValue: number, connectionsCount: number): number {
  return !isNaN(statsValue) && statsValue > 0 ? statsValue : Math.max(0, connectionsCount);
}
export function UserInfoPopoverContent({
  userId,
  userName,
  avatarUrl,
  formattedPublicKey,
}: UserInfoPopoverContentProps) {
  const t = useTranslations('userList');
  const {
    isCurrentUser,
    isLoading: isDataLoading,
    profileBio,
    profileAvatarUrl,
    followers,
    following,
    followersCount,
    followingCount,
    statsFollowers,
    statsFollowing,
    isFollowing,
    isFollowingStatusLoading,
  } = useUserInfoPopoverData(userId);
  const {
    isLoading: isActionLoading,
    onEditClick,
    onFollowClick,
  } = useUserInfoPopoverActions({
    userId,
    isCurrentUser,
    isFollowing,
    isFollowingStatusLoading,
  });
  if (isDataLoading) {
    return <UserInfoPopoverSkeleton />;
  }
  const normalizedFollowers = normalizeStatsValue(statsFollowers, followersCount);
  const normalizedFollowing = normalizeStatsValue(statsFollowing, followingCount);
  const followersAvatars = transformConnectionsToAvatarItems(followers, MAX_AVATARS);
  const followingAvatars = transformConnectionsToAvatarItems(following, MAX_AVATARS);
  return (
    <Container className="gap-3">
      <UserInfoPopoverHeader
        userId={userId}
        userName={userName}
        formattedPublicKey={formattedPublicKey}
        avatarUrl={profileAvatarUrl || avatarUrl}
      />
      {profileBio ? (
        <Container className="max-h-(--popover-bio-max-height) overflow-y-auto" overrideDefaults>
          <PostText content={profileBio} />
        </Container>
      ) : null}
      <UserInfoPopoverStats
        followersCount={normalizedFollowers}
        followingCount={normalizedFollowing}
        followersAvatars={followersAvatars}
        followingAvatars={followingAvatars}
        maxAvatars={MAX_AVATARS}
      />
      {isCurrentUser ? (
        <Button variant="secondary" size="sm" onClick={onEditClick} aria-label={t('editProfile')}>
          <Pencil className="size-4" />
          <Typography className="text-xs leading-4 font-bold" overrideDefaults>
            {t('editProfile')}
          </Typography>
        </Button>
      ) : (
        <UserInfoPopoverFollowButton isFollowing={isFollowing} isLoading={isActionLoading} onClick={onFollowClick} />
      )}
    </Container>
  );
}
