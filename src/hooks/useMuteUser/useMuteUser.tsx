'use client';

import { useCallback, useRef, useState } from 'react';
import { MuteController } from '@/controllers/mute/mute';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { isAppError } from '@/libs/error/error.utils';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { UseMuteUserResult } from './useMuteUser.types';

/**
 * useMuteUser
 *
 * Hook for muting/unmuting users.
 * Handles the mute action through the MuteController, which manages
 * local database updates and homeserver sync.
 */
export function useMuteUser(): UseMuteUserResult {
  const { waitForAuth } = useRequireAuth();
  const inFlight = useRef(new Set<Pubky>());
  const { currentUserPubky } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingUserId, setLoadingUserId] = useState<Pubky | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleMute = useCallback(
    async (userId: Pubky, isCurrentlyMuted: boolean) => {
      if (!currentUserPubky) {
        await waitForAuth(userId);
        setError('User not authenticated');
        return false;
      }

      if (userId === currentUserPubky) {
        setError('Cannot mute yourself');
        return false;
      }

      if (inFlight.current.has(userId)) return false;
      inFlight.current.add(userId);
      setIsLoading(true);
      setLoadingUserId(userId);
      setError(null);

      try {
        if (!(await waitForAuth(userId))) return false;
        const action = isCurrentlyMuted ? HttpMethod.DELETE : HttpMethod.PUT;

        await MuteController.commitMute(action, {
          muter: currentUserPubky,
          mutee: userId,
        });

        Logger.debug(`[useMuteUser] Successfully ${isCurrentlyMuted ? 'unmuted' : 'muted'} user`, {
          userId,
        });
        return true;
      } catch (err) {
        const errorMessage = isAppError(err) ? err.message : 'Could not update mute status';
        setError(errorMessage);
        Logger.error('[useMuteUser] Failed to toggle mute:', err);
        throw err;
      } finally {
        inFlight.current.delete(userId);
        setIsLoading(false);
        setLoadingUserId(null);
      }
    },
    [currentUserPubky, waitForAuth],
  );

  const isUserLoading = useCallback(
    (userId: Pubky) => isLoading && loadingUserId === userId,
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
