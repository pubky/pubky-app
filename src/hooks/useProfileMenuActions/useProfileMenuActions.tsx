'use client';

import { Key, Link, Megaphone, MegaphoneOff, UserRoundMinus, UserRoundPlus } from 'lucide-react';
import { PROFILE_ROUTES } from '@/app/routes';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard/useCopyToClipboard';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useIsFollowing } from '@/hooks/useIsFollowing/useIsFollowing';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import { useMuteUser } from '@/hooks/useMuteUser/useMuteUser';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { isAppError } from '@/libs/error/error.utils';
import { truncateString, withPubkyPrefix } from '@/libs/utils/utils';
import { toast } from '@/molecules/Toaster/use-toast';
import { PROFILE_MENU_ACTION_IDS } from './useProfileMenuActions.constants';
import type { ProfileMenuActionItem, UseProfileMenuActionsResult } from './useProfileMenuActions.types';

/**
 * useProfileMenuActions
 *
 * Hook for generating menu items for profile actions menu.
 * Returns a list of menu items based on user relationships.
 * Handles follow/unfollow, copy actions (pubky, profile link), and mute.
 *
 * @param userId - The public key of the profile user
 * @returns Menu items array and loading state
 */
export function useProfileMenuActions(userId: string): UseProfileMenuActionsResult {
  const { profile, isLoading: isProfileLoading } = useUserProfile(userId);
  const { isFollowing, isLoading: isFollowingLoading } = useIsFollowing(userId);
  const { toggleFollow, isLoading: isFollowLoading, isUserLoading } = useFollowUser();
  const { toggleMute, isLoading: isMuteLoading, isUserLoading: isMuteUserLoading } = useMuteUser();
  const { isMuted } = useMutedUsers();
  const { copyToClipboard: copyPubky } = useCopyToClipboard({
    successTitle: 'Pubky copied to clipboard',
  });
  const { copyToClipboard: copyLink } = useCopyToClipboard({
    successTitle: 'Profile link copied to clipboard',
  });
  const isUserMuted = isMuted(userId);
  const rawUsername = profile?.name || userId;
  const username = truncateString(rawUsername, 15);
  const isLoading = isProfileLoading || isFollowingLoading;
  const profileUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}${PROFILE_ROUTES.PROFILE}/${userId}`;
  const menuItems: ProfileMenuActionItem[] = [];

  // Follow/Unfollow
  menuItems.push({
    id: PROFILE_MENU_ACTION_IDS.FOLLOW,
    label: isFollowing ? `Unfollow ${username}` : `Follow ${username}`,
    icon: isFollowing ? UserRoundMinus : UserRoundPlus,
    onClick: async () => {
      // useFollowUser handles all feedback (toast + state) and never throws.
      await toggleFollow(userId, isFollowing, profile?.name);
    },
    disabled: isFollowLoading || isUserLoading(userId),
  });

  // Copy pubky
  menuItems.push({
    id: PROFILE_MENU_ACTION_IDS.COPY_PUBKY,
    label: 'Copy user pubky',
    icon: Key,
    onClick: async () => {
      try {
        await copyPubky(withPubkyPrefix(userId));
      } catch (error) {
        toast({
          variant: 'error',
          description: isAppError(error) ? error.message : 'Could not copy to clipboard',
        });
      }
    },
  });

  // Copy profile link
  menuItems.push({
    id: PROFILE_MENU_ACTION_IDS.COPY_LINK,
    label: 'Copy profile link',
    icon: Link,
    onClick: async () => {
      try {
        await copyLink(profileUrl);
      } catch (error) {
        toast({
          variant: 'error',
          description: isAppError(error) ? error.message : 'Could not copy to clipboard',
        });
      }
    },
  });

  // Mute/Unmute
  menuItems.push({
    id: PROFILE_MENU_ACTION_IDS.MUTE,
    label: isUserMuted ? `Unmute ${username}` : `Mute ${username}`,
    icon: isUserMuted ? Megaphone : MegaphoneOff,
    onClick: async () => {
      try {
        await toggleMute(userId, isUserMuted);
        toast({
          title: isUserMuted ? `${username} unmuted` : `${username} muted`,
        });
      } catch (error) {
        toast({
          variant: 'error',
          description: isAppError(error) ? error.message : 'Could not update mute status',
        });
      }
    },
    disabled: isMuteLoading || isMuteUserLoading(userId),
  });
  return {
    menuItems,
    isLoading,
  };
}
