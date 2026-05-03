'use client';

import { useCopyToClipboard } from '@/hooks/useCopyToClipboard/useCopyToClipboard';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useIsFollowing } from '@/hooks/useIsFollowing/useIsFollowing';
import { useMuteUser } from '@/hooks/useMuteUser/useMuteUser';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { useTranslations } from 'next-intl';
import { toast } from '@/molecules/Toaster/use-toast';

import { PROFILE_ROUTES } from '@/app/routes';
import { PROFILE_MENU_ACTION_IDS } from './useProfileMenuActions.constants';
import type { UseProfileMenuActionsResult, ProfileMenuActionItem } from './useProfileMenuActions.types';
import { UserRoundMinus, UserRoundPlus, Key, Link, Megaphone, MegaphoneOff } from 'lucide-react';
import { isAppError } from '@/libs/error/error.utils';
import { truncateString, withPubkyPrefix } from '@/libs/utils/utils';

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
  const t = useTranslations('profile.actions');
  const tToast = useTranslations('toast');
  const tErrors = useTranslations('errors');
  const { profile, isLoading: isProfileLoading } = useUserProfile(userId);
  const { isFollowing, isLoading: isFollowingLoading } = useIsFollowing(userId);
  const { toggleFollow, isLoading: isFollowLoading, isUserLoading } = useFollowUser();
  const { toggleMute, isLoading: isMuteLoading, isUserLoading: isMuteUserLoading } = useMuteUser();
  const { isMuted } = useMutedUsers();
  const { copyToClipboard: copyPubky } = useCopyToClipboard({
    successTitle: tToast('copy.pubkyCopied'),
  });
  const { copyToClipboard: copyLink } = useCopyToClipboard({
    successTitle: tToast('copy.profileLinkCopied'),
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
    label: isFollowing
      ? t('unfollowUser', {
          username,
        })
      : t('followUser', {
          username,
        }),
    icon: isFollowing ? UserRoundMinus : UserRoundPlus,
    onClick: async () => {
      try {
        await toggleFollow(userId, isFollowing);
      } catch (error) {
        toast({
          title: tErrors('title'),
          description: isAppError(error) ? error.message : tToast('follow.failed'),
        });
      }
    },
    disabled: isFollowLoading || isUserLoading(userId),
  });

  // Copy pubky
  menuItems.push({
    id: PROFILE_MENU_ACTION_IDS.COPY_PUBKY,
    label: t('copyPubky'),
    icon: Key,
    onClick: async () => {
      try {
        await copyPubky(withPubkyPrefix(userId));
      } catch (error) {
        toast({
          title: tErrors('title'),
          description: isAppError(error) ? error.message : tToast('copy.copyFailed'),
        });
      }
    },
  });

  // Copy profile link
  menuItems.push({
    id: PROFILE_MENU_ACTION_IDS.COPY_LINK,
    label: t('copyLink'),
    icon: Link,
    onClick: async () => {
      try {
        await copyLink(profileUrl);
      } catch (error) {
        toast({
          title: tErrors('title'),
          description: isAppError(error) ? error.message : tToast('copy.copyFailed'),
        });
      }
    },
  });

  // Mute/Unmute
  menuItems.push({
    id: PROFILE_MENU_ACTION_IDS.MUTE,
    label: isUserMuted
      ? t('unmute', {
          username,
        })
      : t('mute', {
          username,
        }),
    icon: isUserMuted ? Megaphone : MegaphoneOff,
    onClick: async () => {
      try {
        await toggleMute(userId, isUserMuted);
        toast({
          title: isUserMuted ? tToast('mute.unmuted') : tToast('mute.muted'),
          description: isUserMuted
            ? tToast('mute.unmutedDesc', {
                username,
              })
            : tToast('mute.mutedDesc', {
                username,
              }),
        });
      } catch (error) {
        toast({
          title: tErrors('title'),
          description: isAppError(error) ? error.message : tToast('mute.failed'),
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
