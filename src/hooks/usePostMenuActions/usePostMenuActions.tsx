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
import { isArticleContent } from '@/libs/post/articleContent';
import { stripPubkyPrefix, truncateString, withPubkyPrefix } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';
import { toast } from '@/molecules/Toaster/toast';
import { POST_MENU_ACTION_IDS, POST_MENU_ACTION_VARIANTS } from './usePostMenuActions.constants';
import type {
  PostMenuActionItem,
  UsePostMenuActionsOptions,
  UsePostMenuActionsResult,
} from './usePostMenuActions.types';

export function usePostMenuActions(postId: string, options: UsePostMenuActionsOptions): UsePostMenuActionsResult {
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
    successTitle: 'Pubky copied to clipboard',
  });
  const { copyToClipboard: copyLink } = useCopyToClipboard({
    successTitle: 'Link copied to clipboard',
  });
  const { copyToClipboard: copyText } = useCopyToClipboard({
    successTitle: 'Text copied to clipboard',
  });
  const isOwnPost = currentUserPubky === postAuthorId;
  const isUserMuted = isMuted(postAuthorId);
  const rawUsername = authorProfile?.name || postAuthorId;
  const username = truncateString(rawUsername, 15);
  const isArticle = postDetails?.kind === 'long' && isArticleContent(postDetails.content);
  // Collections store a JSON envelope in `content`; copying that raw JSON would
  // be useless to the user, so we hide "Copy text" for them just like articles.
  const isCollection = postDetails?.kind === 'collection';
  const isLoading = isPostLoading || isAuthorLoading || isFollowingLoading || isMutedUsersLoading;
  const postUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}${POST_ROUTES.POST}/${parsedId.pubky}/${parsedId.id}`;
  const menuItems: PostMenuActionItem[] = [];
  if (!isOwnPost) {
    menuItems.push({
      id: POST_MENU_ACTION_IDS.FOLLOW,
      label: isFollowing ? `Unfollow ${username}` : `Follow ${username}`,
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
    label: 'Copy pubky',
    icon: Key,
    onClick: async () => {
      try {
        await copyPubky(withPubkyPrefix(postAuthorId));
      } catch (error) {
        toast({
          variant: 'error',
          description: isAppError(error) ? error.message : 'Could not copy to clipboard',
        });
      }
    },
    variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
  });
  menuItems.push({
    id: POST_MENU_ACTION_IDS.COPY_LINK,
    label: 'Copy link to post',
    icon: Link,
    onClick: async () => {
      try {
        await copyLink(postUrl);
      } catch (error) {
        toast({
          variant: 'error',
          description: isAppError(error) ? error.message : 'Could not copy to clipboard',
        });
      }
    },
    variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
  });
  if (!isArticle && !isCollection) {
    menuItems.push({
      id: POST_MENU_ACTION_IDS.COPY_TEXT,
      label: 'Copy text of post',
      icon: FileText,
      onClick: async () => {
        try {
          await copyText(postDetails?.content ?? '');
        } catch (error) {
          toast({
            variant: 'error',
            description: isAppError(error) ? error.message : 'Could not copy to clipboard',
          });
        }
      },
      variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
    });
  }
  if (!isOwnPost) {
    menuItems.push({
      id: POST_MENU_ACTION_IDS.MUTE,
      label: isUserMuted ? `Unmute ${username}` : `Mute ${username}`,
      icon: isUserMuted ? Megaphone : MegaphoneOff,
      onClick: async () => {
        try {
          await toggleMute(postAuthorId, isUserMuted);
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
      variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
      disabled: isMuteLoading || isMuteUserLoading(postAuthorId),
    });
    menuItems.push({
      id: POST_MENU_ACTION_IDS.REPORT,
      label: 'Report post',
      icon: Flag,
      onClick: onReportClick,
      variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
    });
  }
  if (isOwnPost) {
    menuItems.push({
      id: POST_MENU_ACTION_IDS.EDIT,
      label: 'Edit post',
      icon: Edit,
      onClick: onEditClick,
      variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
    });
    menuItems.push({
      id: POST_MENU_ACTION_IDS.DELETE,
      label: 'Delete post',
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
