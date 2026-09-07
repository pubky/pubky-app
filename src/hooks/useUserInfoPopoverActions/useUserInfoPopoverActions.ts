'use client';

import { useRouter } from 'next/navigation';
import { SETTINGS_ROUTES } from '@/app/routes';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';

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
  const { requireAuth } = useRequireAuth();
  const { toggleFollow, isUserLoading } = useFollowUser();

  const isLoading = isUserLoading(userId) || isFollowingStatusLoading;

  const onEditClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(SETTINGS_ROUTES.EDIT);
  };

  const onFollowClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isCurrentUser) return;
    requireAuth(async () => {
      // useFollowUser handles all feedback (toast + state) and never throws.
      await toggleFollow(userId, isFollowing);
    });
  };

  return { isLoading, onEditClick, onFollowClick };
}
