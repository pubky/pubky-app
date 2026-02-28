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
  const isMountedRef = useRef(true);

  const fetchUrl = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setUrl('');

    try {
      // Request auth URL from controller
      const { authorizationUrl, awaitApproval } =
        type === 'signup' && inviteCode
          ? await Core.HomegateController.getSignupAuthUrl(inviteCode)
          : await Core.AuthController.getAuthUrl();

      awaitApproval
        .then(async (session: Session) => {
          // No isMountedRef guard here: initializeAuthenticatedSession updates global stores
          // and must run even if the component unmounted (e.g., mobile deeplink handoff where
          // the browser may unmount/remount the page while Pubky Ring is open).
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

          Molecules.toast({
            title: 'Authorization was not completed',
            description: 'The signer did not complete authorization. Please try again.',
          });
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

    // We intentionally do NOT cancel the auth flow on unmount. The polling must survive
    // component lifecycle changes (e.g., mobile deeplink handoff where the browser may
    // unmount/remount the component while the user is in Pubky Ring). The AuthController
    // already self-manages flow lifetime: it cancels stale flows when a new one starts
    // (getAuthUrl), on successful session init, and on sign-out.
    return () => {
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
    fetchUrl,
  };
}
