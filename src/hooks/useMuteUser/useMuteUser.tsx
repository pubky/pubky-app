'use client';

import { useState, useCallback } from 'react';
import * as Core from '@/core';
import * as Libs from '@/libs';
import type { UseMuteUserResult } from './useMuteUser.types';

/**
 * useMuteUser
 *
 * Hook for muting/unmuting users.
 * Handles the mute action through the MuteController, which manages
 * local database updates and homeserver sync.
 */
export function useMuteUser(): UseMuteUserResult {
  const { currentUserPubky } = Core.useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingUserId, setLoadingUserId] = useState<Core.Pubky | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleMute = useCallback(
    async (userId: Core.Pubky, isCurrentlyMuted: boolean) => {
      if (!currentUserPubky) {
        setError('User not authenticated');
        return;
      }

      if (userId === currentUserPubky) {
        setError('Cannot mute yourself');
        return;
      }

      setIsLoading(true);
      setLoadingUserId(userId);
      setError(null);

      try {
        const action = isCurrentlyMuted ? Libs.HttpMethod.DELETE : Libs.HttpMethod.PUT;

        await Core.MuteController.commitMute(action, {
          muter: currentUserPubky,
          mutee: userId,
        });

        Libs.Logger.debug(`[useMuteUser] Successfully ${isCurrentlyMuted ? 'unmuted' : 'muted'} user`, {
          userId,
        });
      } catch (err) {
        const errorMessage = Libs.isAppError(err) ? err.message : 'Failed to update mute status';
        setError(errorMessage);
        Libs.Logger.error('[useMuteUser] Failed to toggle mute:', err);
        throw err;
      } finally {
        setIsLoading(false);
        setLoadingUserId(null);
      }
    },
    [currentUserPubky],
  );

  const isUserLoading = useCallback(
    (userId: Core.Pubky) => isLoading && loadingUserId === userId,
    [isLoading, loadingUserId],
  );

  return {
    toggleMute,
    isLoading,
    loadingUserId,
    isUserLoading,
    error,
  };
}
