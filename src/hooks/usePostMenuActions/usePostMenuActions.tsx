'use client';

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
import {
  Edit,
  FileText,
  Flag,
  Key,
  Link,
  Megaphone,
  MegaphoneOff,
  Trash,
  UserRoundMinus,
  UserRoundPlus,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { POST_ROUTES } from '@/app/routes';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard/useCopyToClipboard';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useIsFollowing } from '@/hooks/useIsFollowing/useIsFollowing';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import { useMuteUser } from '@/hooks/useMuteUser/useMuteUser';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { isAppError } from '@/libs/error/error.utils';
import { stripPubkyPrefix, truncateString, withPubkyPrefix } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';
import { toast } from '@/molecules/Toaster/use-toast';
import { POST_MENU_ACTION_IDS, POST_MENU_ACTION_VARIANTS } from './usePostMenuActions.constants';
import type {
  PostMenuActionItem,
  UsePostMenuActionsOptions,
  UsePostMenuActionsResult,
} from './usePostMenuActions.types';

export function usePostMenuActions(postId: string, options: UsePostMenuActionsOptions): UsePostMenuActionsResult {
  const t = useTranslations('post.actions');

  const tMute = useTranslations('toast.mute');
  const tCopy = useTranslations('toast.copy');
  const { onReportClick, onEditClick, onDeleteClick, isDeleting = false } = options;
  const parsedId = parseCompositeId(postId);
  // Normalize author ID to ensure consistent format (strip pubky: or pk: prefix)
  // This is necessary because composite IDs may contain prefixed pubky IDs
  const postAuthorId = stripPubkyPrefix(parsedId.pubky) as Pubky;
  const { currentUserPubky } = useCurrentUserProfile();
  const { postDetails, isLoading: isPostLoading } = usePostDetails(postId);
  const { profile: authorProfile, isLoading: isAuthorLoading } = useUserProfile(postAuthorId);
  const { isFollowing, isLoading: isFollowingLoading } = useIsFollowing(postAuthorId);
  const { toggleFollow, isLoading: isFollowLoading, isUserLoading } = useFollowUser();
  const { toggleMute, isLoading: isMuteLoading, isUserLoading: isMuteUserLoading } = useMuteUser();
  const { isMuted, isLoading: isMutedUsersLoading } = useMutedUsers();
  const { copyToClipboard: copyPubky } = useCopyToClipboard({
    successTitle: tCopy('pubkyCopied'),
  });
  const { copyToClipboard: copyLink } = useCopyToClipboard({
    successTitle: tCopy('linkCopied'),
  });
  const { copyToClipboard: copyText } = useCopyToClipboard({
    successTitle: tCopy('textCopied'),
  });
  const isOwnPost = currentUserPubky === postAuthorId;
  const isUserMuted = isMuted(postAuthorId);
  const rawUsername = authorProfile?.name || postAuthorId;
  const username = truncateString(rawUsername, 15);
  const isArticle = postDetails?.kind === 'long';
  const isLoading = isPostLoading || isAuthorLoading || isFollowingLoading || isMutedUsersLoading;
  const postUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}${POST_ROUTES.POST}/${parsedId.pubky}/${parsedId.id}`;
  const menuItems: PostMenuActionItem[] = [];
  if (!isOwnPost) {
    menuItems.push({
      id: POST_MENU_ACTION_IDS.FOLLOW,
      label: isFollowing
        ? t('unfollowUser', {
            username,
          })
        : t('followUser', {
            username,
          }),
      icon: isFollowing ? UserRoundMinus : UserRoundPlus,
      onClick: async () => {
        // useFollowUser handles all feedback (toast + state) and never throws.
        await toggleFollow(postAuthorId, isFollowing, authorProfile?.name);
      },
      variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
      disabled: isFollowLoading || isUserLoading(postAuthorId),
    });
  }
  menuItems.push({
    id: POST_MENU_ACTION_IDS.COPY_PUBKY,
    label: t('copyPubky'),
    icon: Key,
    onClick: async () => {
      try {
        await copyPubky(withPubkyPrefix(postAuthorId));
      } catch (error) {
        toast({
          variant: 'error',
          description: isAppError(error) ? error.message : tCopy('copyFailedDesc'),
        });
      }
    },
    variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
  });
  menuItems.push({
    id: POST_MENU_ACTION_IDS.COPY_LINK,
    label: t('copyLink'),
    icon: Link,
    onClick: async () => {
      try {
        await copyLink(postUrl);
      } catch (error) {
        toast({
          variant: 'error',
          description: isAppError(error) ? error.message : tCopy('copyFailedDesc'),
        });
      }
    },
    variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
  });
  if (!isArticle) {
    menuItems.push({
      id: POST_MENU_ACTION_IDS.COPY_TEXT,
      label: t('copyText'),
      icon: FileText,
      onClick: async () => {
        try {
          await copyText(postDetails?.content ?? '');
        } catch (error) {
          toast({
            variant: 'error',
            description: isAppError(error) ? error.message : tCopy('copyFailedDesc'),
          });
        }
      },
      variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
    });
  }
  if (!isOwnPost) {
    menuItems.push({
      id: POST_MENU_ACTION_IDS.MUTE,
      label: isUserMuted
        ? t('unmuteUser', {
            username,
          })
        : t('muteUser', {
            username,
          }),
      icon: isUserMuted ? Megaphone : MegaphoneOff,
      onClick: async () => {
        try {
          await toggleMute(postAuthorId, isUserMuted);
          toast({
            title: isUserMuted ? tMute('unmuted', { username }) : tMute('muted', { username }),
          });
        } catch (error) {
          toast({
            variant: 'error',
            description: isAppError(error) ? error.message : tMute('failed'),
          });
        }
      },
      variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
      disabled: isMuteLoading || isMuteUserLoading(postAuthorId),
    });
    menuItems.push({
      id: POST_MENU_ACTION_IDS.REPORT,
      label: t('reportPost'),
      icon: Flag,
      onClick: onReportClick,
      variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
    });
  }
  if (isOwnPost) {
    menuItems.push({
      id: POST_MENU_ACTION_IDS.EDIT,
      label: t('editPost'),
      icon: Edit,
      onClick: onEditClick,
      variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
    });
    menuItems.push({
      id: POST_MENU_ACTION_IDS.DELETE,
      label: t('deletePost'),
      icon: Trash,
      onClick: onDeleteClick,
      variant: POST_MENU_ACTION_VARIANTS.DESTRUCTIVE,
      disabled: isDeleting,
    });
  }
  return {
    menuItems,
    isLoading,
  };
}
