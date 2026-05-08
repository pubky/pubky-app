'use client';

import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useIsFollowing } from '@/hooks/useIsFollowing/useIsFollowing';
import { useProfileConnections } from '@/hooks/useProfileConnections/useProfileConnections';
import { CONNECTION_TYPE, type UserConnectionData } from '@/hooks/useProfileConnections/useProfileConnections.types';
import { useProfileStats } from '@/hooks/useProfileStats/useProfileStats';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';

interface UseUserInfoPopoverDataResult {
  isCurrentUser: boolean;
  isLoading: boolean;
  profileBio?: string;
  profileAvatarUrl?: string;
  followers: UserConnectionData[];
  following: UserConnectionData[];
  followersCount: number;
  followingCount: number;
  statsFollowers: number;
  statsFollowing: number;
  isFollowing: boolean;
  isFollowingStatusLoading: boolean;
}

export function useUserInfoPopoverData(userId: string): UseUserInfoPopoverDataResult {
  const { currentUserPubky } = useCurrentUserProfile();
  const isCurrentUser = currentUserPubky === userId;

  const { profile, isLoading: isProfileLoading } = useUserProfile(userId);
  const { stats, isLoading: isStatsLoading } = useProfileStats(userId);
  const { isFollowing, isLoading: isFollowingStatusLoading } = useIsFollowing(userId);

  const { connections: followers, count: followersCount } = useProfileConnections(CONNECTION_TYPE.FOLLOWERS, userId);
  const { connections: following, count: followingCount } = useProfileConnections(CONNECTION_TYPE.FOLLOWING, userId);

  // Consider loaded when profile and stats are ready (connections can load lazily)
  const isLoading = isProfileLoading || isStatsLoading;

  return {
    isCurrentUser,
    isLoading,
    profileBio: profile?.bio,
    profileAvatarUrl: profile?.avatarUrl,
    followers,
    following,
    followersCount,
    followingCount,
    statsFollowers: stats.followers,
    statsFollowing: stats.following,
    isFollowing,
    isFollowingStatusLoading,
  };
}
