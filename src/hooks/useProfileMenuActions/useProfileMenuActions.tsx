'use client';

import { useTranslations } from 'next-intl';
import * as Hooks from '@/hooks';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';
import { PROFILE_ROUTES } from '@/app/routes';
import { PROFILE_MENU_ACTION_IDS } from './useProfileMenuActions.constants';
import type { UseProfileMenuActionsResult, ProfileMenuActionItem } from './useProfileMenuActions.types';

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
import { UserRoundMinus, UserRoundPlus, Key, Link, Megaphone, MegaphoneOff } from 'lucide-react';
export function useProfileMenuActions(userId: string): UseProfileMenuActionsResult {
  const t = useTranslations('profile.actions');
  const tToast = useTranslations('toast');
  const tErrors = useTranslations('errors');
  const { profile, isLoading: isProfileLoading } = Hooks.useUserProfile(userId);
  const { isFollowing, isLoading: isFollowingLoading } = Hooks.useIsFollowing(userId);
  const { toggleFollow, isLoading: isFollowLoading, isUserLoading } = Hooks.useFollowUser();
  const { toggleMute, isLoading: isMuteLoading, isUserLoading: isMuteUserLoading } = Hooks.useMuteUser();
  const { isMuted } = Hooks.useMutedUsers();
  const { copyToClipboard: copyPubky } = Hooks.useCopyToClipboard({
    successTitle: tToast('copy.pubkyCopied'),
  });
  const { copyToClipboard: copyLink } = Hooks.useCopyToClipboard({
    successTitle: tToast('copy.profileLinkCopied'),
  });
  const isUserMuted = isMuted(userId);
  const rawUsername = profile?.name || userId;
  const username = Libs.truncateString(rawUsername, 15);
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
        Molecules.toast({
          title: tErrors('title'),
          description: Libs.isAppError(error) ? error.message : tToast('follow.failed'),
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
        await copyPubky(Libs.withPubkyPrefix(userId));
      } catch (error) {
        Molecules.toast({
          title: tErrors('title'),
          description: Libs.isAppError(error) ? error.message : tToast('copy.copyFailed'),
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
        Molecules.toast({
          title: tErrors('title'),
          description: Libs.isAppError(error) ? error.message : tToast('copy.copyFailed'),
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
        Molecules.toast({
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
        Molecules.toast({
          title: tErrors('title'),
          description: Libs.isAppError(error) ? error.message : tToast('mute.failed'),
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
