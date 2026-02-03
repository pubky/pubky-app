'use client';

import { useTranslations } from 'next-intl';
import * as Core from '@/core';
import * as Hooks from '@/hooks';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';
import { POST_ROUTES } from '@/app/routes';
import { POST_MENU_ACTION_IDS, POST_MENU_ACTION_VARIANTS } from './usePostMenuActions.constants';
import type {
  UsePostMenuActionsResult,
  UsePostMenuActionsOptions,
  PostMenuActionItem,
} from './usePostMenuActions.types';

/**
 * usePostMenuActions
 *
 * Hook for generating menu items for post actions menu.
 * Returns a list of menu items based on post ownership, post type, and user relationships.
 * Handles follow/unfollow, copy actions (pubky, link, text), mute, report, and delete.
 *
 * @param postId - Composite post ID in format "author:postId"
 * @param options - Optional configuration including callbacks
 * @returns Menu items array, loading state, and report post data
 */
export function usePostMenuActions(postId: string, options: UsePostMenuActionsOptions): UsePostMenuActionsResult {
  const t = useTranslations('post.actions');
  const tToast = useTranslations('toast');
  const tMute = useTranslations('toast.mute');
  const tCopy = useTranslations('toast.copy');
  const tFollow = useTranslations('toast.follow');

  const { onReportClick, onEditClick } = options;
  const parsedId = Core.parseCompositeId(postId);
  const postAuthorId = parsedId.pubky;

  const { currentUserPubky } = Hooks.useCurrentUserProfile();
  const { postDetails, isLoading: isPostLoading } = Hooks.usePostDetails(postId);
  const { profile: authorProfile, isLoading: isAuthorLoading } = Hooks.useUserProfile(postAuthorId);
  const { isFollowing, isLoading: isFollowingLoading } = Hooks.useIsFollowing(postAuthorId);

  const { toggleFollow, isLoading: isFollowLoading, isUserLoading } = Hooks.useFollowUser();
  const { toggleMute, isLoading: isMuteLoading, isUserLoading: isMuteUserLoading } = Hooks.useMuteUser();
  const { isMuted } = Hooks.useMutedUsers();
  const { deletePost, isDeleting } = Hooks.useDeletePost();
  const { copyToClipboard: copyPubky } = Hooks.useCopyToClipboard({
    successTitle: tCopy('pubkyCopied'),
  });
  const { copyToClipboard: copyLink } = Hooks.useCopyToClipboard({
    successTitle: tCopy('linkCopied'),
  });
  const { copyToClipboard: copyText } = Hooks.useCopyToClipboard({
    successTitle: tCopy('textCopied'),
  });

  const isOwnPost = currentUserPubky === postAuthorId;
  const isUserMuted = isMuted(postAuthorId);
  const rawUsername = authorProfile?.name || postAuthorId;
  const username = Libs.truncateString(rawUsername, 15);
  const isArticle = postDetails?.kind === 'long';
  const isLoading = isPostLoading || isAuthorLoading || isFollowingLoading;
  const postUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}${POST_ROUTES.POST}/${parsedId.pubky}/${parsedId.id}`;

  const menuItems: PostMenuActionItem[] = [];

  if (!isOwnPost) {
    menuItems.push({
      id: POST_MENU_ACTION_IDS.FOLLOW,
      label: isFollowing ? t('unfollowUser', { username }) : t('followUser', { username }),
      icon: isFollowing ? Libs.UserRoundMinus : Libs.UserRoundPlus,
      onClick: async () => {
        try {
          await toggleFollow(postAuthorId, isFollowing);
        } catch (error) {
          Molecules.toast({
            title: tToast('error'),
            description: Libs.isAppError(error) ? error.message : tFollow('failed'),
          });
        }
      },
      variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
      disabled: isFollowLoading || isUserLoading(postAuthorId),
    });
  }

  menuItems.push({
    id: POST_MENU_ACTION_IDS.COPY_PUBKY,
    label: t('copyPubky'),
    icon: Libs.Key,
    onClick: async () => {
      try {
        await copyPubky(Libs.withPubkyPrefix(postAuthorId));
      } catch (error) {
        Molecules.toast({
          title: tToast('error'),
          description: Libs.isAppError(error) ? error.message : tCopy('copyFailedDesc'),
        });
      }
    },
    variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
  });

  menuItems.push({
    id: POST_MENU_ACTION_IDS.COPY_LINK,
    label: t('copyLink'),
    icon: Libs.Link,
    onClick: async () => {
      try {
        await copyLink(postUrl);
      } catch (error) {
        Molecules.toast({
          title: tToast('error'),
          description: Libs.isAppError(error) ? error.message : tCopy('copyFailedDesc'),
        });
      }
    },
    variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
  });

  if (!isArticle) {
    menuItems.push({
      id: POST_MENU_ACTION_IDS.COPY_TEXT,
      label: t('copyText'),
      icon: Libs.FileText,
      onClick: async () => {
        try {
          await copyText(postDetails?.content ?? '');
        } catch (error) {
          Molecules.toast({
            title: tToast('error'),
            description: Libs.isAppError(error) ? error.message : tCopy('copyFailedDesc'),
          });
        }
      },
      variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
    });
  }

  if (!isOwnPost) {
    menuItems.push({
      id: POST_MENU_ACTION_IDS.MUTE,
      label: isUserMuted ? t('unmuteUser', { username }) : t('muteUser', { username }),
      icon: isUserMuted ? Libs.Megaphone : Libs.MegaphoneOff,
      onClick: async () => {
        try {
          await toggleMute(postAuthorId, isUserMuted);
          Molecules.toast({
            title: isUserMuted ? tMute('unmuted') : tMute('muted'),
            description: isUserMuted ? tMute('unmutedDesc', { username }) : tMute('mutedDesc', { username }),
          });
        } catch (error) {
          Molecules.toast({
            title: tToast('error'),
            description: Libs.isAppError(error) ? error.message : tMute('failed'),
          });
        }
      },
      variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
      disabled: isMuteLoading || isMuteUserLoading(postAuthorId),
    });

    menuItems.push({
      id: POST_MENU_ACTION_IDS.REPORT,
      label: t('reportPost'),
      icon: Libs.Flag,
      onClick: onReportClick,
      variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
    });
  }

  if (isOwnPost) {
    menuItems.push({
      id: POST_MENU_ACTION_IDS.EDIT,
      label: t('editPost'),
      icon: Libs.Edit,
      onClick: onEditClick,
      variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
    });

    menuItems.push({
      id: POST_MENU_ACTION_IDS.DELETE,
      label: t('deletePost'),
      icon: Libs.Trash,
      onClick: () => deletePost(postId),
      variant: POST_MENU_ACTION_VARIANTS.DESTRUCTIVE,
      disabled: isDeleting,
    });
  }

  return {
    menuItems,
    isLoading,
  };
}
