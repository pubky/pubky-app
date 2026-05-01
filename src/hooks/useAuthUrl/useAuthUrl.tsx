'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@synonymdev/pubky';
import { useTranslations } from 'next-intl';
import { toast } from '@/molecules/Toaster/use-toast';

import type { UseAuthUrlOptions, UseAuthUrlReturn } from './useAuthUrl.types';
import { Logger } from '@/libs/logger/logger';
import { copyToClipboard } from '@/libs/utils/utils';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { isAppError, isAuthError, isTimeoutError } from '@/libs/error/error.utils';
import { AuthController } from '@/controllers/auth/auth';
import { AUTH_FLOW_CANCELED_ERROR_NAME } from '@/services/homeserver/error.utils';
/** Returns true if the error indicates the auth flow has expired (timeout or SESSION_EXPIRED). */
const isAuthFlowExpiredError = (error: unknown): boolean => {
  if (!isAppError(error)) return false;
  if (isTimeoutError(error)) return true;
  return isAuthError(error) && error.code === AuthErrorCode.SESSION_EXPIRED;
};

/**
 * Manages the authentication URL lifecycle for Pubky Ring authorization.
 * @param options - Configuration for auth URL generation (autoFetch, type, inviteCode for signup)
 * @returns URL state, loading/expired flags, and fetch/copy actions
 */
export function useAuthUrl(options: UseAuthUrlOptions = {}): UseAuthUrlReturn {
  const autoFetch = options.autoFetch ?? true;
  const type = options.type ?? 'signin';
  const inviteCode = options.type === 'signup' ? options.inviteCode : '';
  const t = useTranslations('onboarding.signIn');

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
        type === 'signup' ? await AuthController.getSignupAuthUrl(inviteCode) : await AuthController.getAuthUrl();

      awaitApproval
        .then(async (session: Session) => {
          // No isMountedRef guard here: initializeAuthenticatedSession updates global stores
          // and must run even if the component unmounted (e.g., mobile deeplink handoff where
          // the browser may unmount/remount the page while Pubky Ring is open).
          try {
            await AuthController.initializeAuthenticatedSession({ session });
          } catch (error) {
            Logger.error('Failed to persist session and check profile:', error);
            if (!isMountedRef.current) return;
            toast({
              title: t('authInitFailedTitle'),
              description: t('authInitFailedDescription'),
            });
          }
        })
        .catch((error: unknown) => {
          if (
            typeof error === 'object' &&
            error !== null &&
            'name' in error &&
            (error as { name?: unknown }).name === AUTH_FLOW_CANCELED_ERROR_NAME
          ) {
            return;
          }

          Logger.error('Authorization promise rejected:', error);
          if (!isMountedRef.current) return;

          if (isAuthFlowExpiredError(error)) {
            setUrl('');
            setIsExpired(true);
            return;
          }

          toast({
            title: t('authNotCompletedTitle'),
            description: t('authNotCompletedDescription'),
          });
        });

      if (!isMountedRef.current) return;
      setUrl(authorizationUrl ?? '');
    } catch (error) {
      Logger.error('Failed to generate auth URL:', error);
      if (!isMountedRef.current) return;
      toast({
        title: t('qrGenerationFailedTitle'),
        description: t('qrGenerationFailedDescription'),
      });
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [type, inviteCode, t]);

  const copyAuthUrl = useCallback(async (): Promise<void> => {
    if (!url) return;
    try {
      await copyToClipboard({ text: url });
    } catch (error) {
      Logger.error('Failed to copy auth URL to clipboard', error);
    }
  }, [url]);

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
    isExpired,
    fetchUrl,
    copyAuthUrl,
  };
}
