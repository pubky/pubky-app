'use client';

import { useRouter } from 'next/navigation';
import * as App from '@/app';
import * as Hooks from '@/hooks';

interface UseUserInfoPopoverActionsResult {
  isLoading: boolean;
  onEditClick: (e: React.MouseEvent) => void;
  onFollowClick: (e: React.MouseEvent) => Promise<void>;
}

export function useUserInfoPopoverActions({
  userId,
  isCurrentUser,
  isFollowing,
  isFollowingStatusLoading,
}: {
  userId: string;
  isCurrentUser: boolean;
  isFollowing: boolean;
  isFollowingStatusLoading: boolean;
}): UseUserInfoPopoverActionsResult {
  const router = useRouter();
  const { toggleFollow, isUserLoading } = Hooks.useFollowUser();

  const isLoading = isUserLoading(userId) || isFollowingStatusLoading;

  const onEditClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(App.SETTINGS_ROUTES.EDIT);
  };

  const onFollowClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isCurrentUser) return;
    try {
      await toggleFollow(userId, isFollowing);
    } catch {
      // Error already handled by useFollowUser (logged + state updated)
    }
  };

  return { isLoading, onEditClick, onFollowClick };
}
