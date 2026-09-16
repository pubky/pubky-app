'use client';

import { useCallback, useState } from 'react';
import { UserController } from '@/controllers/user/user';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { FOLLOW_ACTIONS, type FollowAction, type UseFollowUserResult } from './useFollowUser.types';

const EMPTY_PENDING_ACTIONS: ReadonlyMap<Pubky, FollowAction> = new Map();

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
  // Every in-flight toggle keyed by user, so concurrent clicks on different users each keep their
  // own loading state instead of the last click overwriting a single `loadingUserId`.
  const [pendingActions, setPendingActions] = useState<ReadonlyMap<Pubky, FollowAction>>(EMPTY_PENDING_ACTIONS);
  const [error, setError] = useState<string | null>(null);

  const toggleFollow = useCallback(
    async (userId: Pubky, isCurrentlyFollowing: boolean) => {
      if (!currentUserPubky) {
        setError('User not authenticated');
        return false;
      }

      if (userId === currentUserPubky) {
        setError('Cannot follow yourself');
        return false;
      }

      const pendingAction: FollowAction = isCurrentlyFollowing ? FOLLOW_ACTIONS.UNFOLLOW : FOLLOW_ACTIONS.FOLLOW;
      setPendingActions((prev) => new Map(prev).set(userId, pendingAction));
      setError(null);

      try {
        const action = isCurrentlyFollowing ? HttpMethod.DELETE : HttpMethod.PUT;

        await UserController.commitFollow(action, {
          follower: currentUserPubky,
          followee: userId,
        });

        toast({
          title: isCurrentlyFollowing ? 'User unfollowed' : 'User followed',
        });

        Logger.debug(`[useFollowUser] Successfully ${isCurrentlyFollowing ? 'unfollowed' : 'followed'} user`, {
          userId,
        });

        return true;
      } catch (err) {
        // Always a friendly, static message — raw transport/server text never reaches the user.
        const message = isCurrentlyFollowing
          ? 'Could not unfollow user. Try again.'
          : 'Could not follow user. Try again.';
        setError(message);
        toast({
          variant: 'error',
          description: message,
        });
        Logger.error('[useFollowUser] Failed to toggle follow:', err);
        return false;
      } finally {
        setPendingActions((prev) => {
          if (!prev.has(userId)) return prev;
          const next = new Map(prev);
          next.delete(userId);
          return next.size === 0 ? EMPTY_PENDING_ACTIONS : next;
        });
      }
    },
    [currentUserPubky],
  );

  const isUserLoading = useCallback((userId: Pubky) => pendingActions.has(userId), [pendingActions]);

  // Single-target consumers (profile pages) read the most recent in-flight toggle.
  const latestPending = [...pendingActions.entries()].at(-1);

  return {
    toggleFollow,
    isLoading: pendingActions.size > 0,
    loadingAction: latestPending?.[1] ?? null,
    loadingUserId: latestPending?.[0] ?? null,
    isUserLoading,
    error,
  };
}
