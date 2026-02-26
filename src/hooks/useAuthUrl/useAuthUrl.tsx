'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@synonymdev/pubky';

import * as Core from '@/core';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';

import type { UseAuthUrlOptions, UseAuthUrlReturn } from './useAuthUrl.types';

/**
 * Manages the authentication URL lifecycle for Pubky Ring authorization.
 */
export function useAuthUrl(options: UseAuthUrlOptions = {}): UseAuthUrlReturn {
  const { autoFetch = true, type = 'signin', inviteCode } = options;

  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(autoFetch);
  const [isExpired, setIsExpired] = useState(false);
  const isMountedRef = useRef(true);

  const fetchUrl = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setIsExpired(false);
    setUrl('');

    try {
      // Request auth URL from controller
      const { authorizationUrl, awaitApproval } =
        type === 'signup' && inviteCode
          ? await Core.HomegateController.getSignupAuthUrl(inviteCode)
          : await Core.AuthController.getAuthUrl();

      awaitApproval
        .then(async (session: Session) => {
          if (!isMountedRef.current) return;
          try {
            await Core.AuthController.initializeAuthenticatedSession({ session });
          } catch (error) {
            Libs.Logger.error('Failed to persist session and check profile:', error);
            if (!isMountedRef.current) return;
            Molecules.toast({
              title: 'Sign in failed. Please try again.',
              description: 'Unable to complete authorization with Pubky Ring. Please try again.',
            });
          }
        })
        .catch((error: unknown) => {
          if (
            typeof error === 'object' &&
            error !== null &&
            'name' in error &&
            (error as { name?: unknown }).name === 'AuthFlowCanceled'
          ) {
            return;
          }

          Libs.Logger.error('Authorization promise rejected:', error);
          if (!isMountedRef.current) return;

          setUrl('');
          setIsExpired(true);
        });

      if (!isMountedRef.current) return;
      setUrl(authorizationUrl ?? '');
    } catch (error) {
      Libs.Logger.error('Failed to generate auth URL:', error);
      if (!isMountedRef.current) return;
      Molecules.toast({
        title: 'QR code generation failed',
        description: 'Unable to generate sign-in QR code. Please refresh and try again.',
      });
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [type, inviteCode]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      Core.AuthController.cancelActiveAuthFlow();
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!autoFetch) return;
    void fetchUrl();
  }, [autoFetch, fetchUrl]);

  return {
    url,
    isLoading,
    isExpired,
    fetchUrl,
  };
}
