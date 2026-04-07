'use client';

import * as Hooks from '@/hooks';
import type { UserConnectionData } from '@/hooks/useProfileConnections/useProfileConnections.types';

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
  const { currentUserPubky } = Hooks.useCurrentUserProfile();
  const isCurrentUser = currentUserPubky === userId;

  const { profile, isLoading: isProfileLoading } = Hooks.useUserProfile(userId);
  const { stats, isLoading: isStatsLoading } = Hooks.useProfileStats(userId);
  const { isFollowing, isLoading: isFollowingStatusLoading } = Hooks.useIsFollowing(userId);

  const { connections: followers, count: followersCount } = Hooks.useProfileConnections(
    Hooks.CONNECTION_TYPE.FOLLOWERS,
    userId,
  );
  const { connections: following, count: followingCount } = Hooks.useProfileConnections(
    Hooks.CONNECTION_TYPE.FOLLOWING,
    userId,
  );

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
