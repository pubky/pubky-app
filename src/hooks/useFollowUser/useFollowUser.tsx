'use client';

import { useState, useCallback } from 'react';
import type { UseFollowUserResult } from './useFollowUser.types';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { isAppError } from '@/libs/error/error.utils';
import { UserController } from '@/controllers/user/user';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
/**
 * useFollowUser
 *
 * Hook for following/unfollowing users.
 * Handles the follow action through the UserController, which manages
 * local database updates and homeserver sync.
 *
 * @returns Follow action handler, loading state, and error state
 *
 * @example
 * ```tsx
 * const { toggleFollow, isLoading, isUserLoading, error } = useFollowUser();
 *
 * const handleFollow = async (userId: Pubky, isFollowing: boolean) => {
 *   await toggleFollow(userId, isFollowing);
 * };
 *
 * // Check if a specific user is loading
 * const showSpinner = isUserLoading(userId);
 * ```
 */
export function useFollowUser(): UseFollowUserResult {
  const { currentUserPubky } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<UseFollowUserResult['loadingAction']>(null);
  const [loadingUserId, setLoadingUserId] = useState<Pubky | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleFollow = useCallback(
    async (userId: Pubky, isCurrentlyFollowing: boolean) => {
      if (!currentUserPubky) {
        setError('User not authenticated');
        return;
      }

      if (userId === currentUserPubky) {
        setError('Cannot follow yourself');
        return;
      }

      setLoadingAction(isCurrentlyFollowing ? 'unfollow' : 'follow');
      setIsLoading(true);
      setLoadingUserId(userId);
      setError(null);

      try {
        const action = isCurrentlyFollowing ? HttpMethod.DELETE : HttpMethod.PUT;

        await UserController.commitFollow(action, {
          follower: currentUserPubky,
          followee: userId,
        });

        Logger.debug(`[useFollowUser] Successfully ${isCurrentlyFollowing ? 'unfollowed' : 'followed'} user`, {
          userId,
        });
      } catch (err) {
        const errorMessage = isAppError(err) ? err.message : 'Failed to update follow status';
        setError(errorMessage);
        Logger.error('[useFollowUser] Failed to toggle follow:', err);
        throw err;
      } finally {
        setIsLoading(false);
        setLoadingAction(null);
        setLoadingUserId(null);
      }
    },
    [currentUserPubky],
  );

  const isUserLoading = useCallback(
    (userId: Pubky) => isLoading && loadingUserId === userId,
    [isLoading, loadingUserId],
  );

  return {
    toggleFollow,
    isLoading,
    loadingAction,
    loadingUserId,
    isUserLoading,
    error,
  };
}
