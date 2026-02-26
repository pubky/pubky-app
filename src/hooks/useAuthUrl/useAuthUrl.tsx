'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@synonymdev/pubky';
import { useTranslations } from 'next-intl';

import * as Core from '@/core';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';

import type { UseAuthUrlOptions, UseAuthUrlReturn } from './useAuthUrl.types';

const isAuthFlowExpiredError = (error: unknown): boolean => {
  if (!Libs.isAppError(error)) return false;
  if (Libs.isTimeoutError(error)) return true;
  return Libs.isAuthError(error) && error.code === Libs.AuthErrorCode.SESSION_EXPIRED;
};

/**
 * Manages the authentication URL lifecycle for Pubky Ring authorization.
 */
export function useAuthUrl(options: UseAuthUrlOptions = {}): UseAuthUrlReturn {
  const { autoFetch = true, type = 'signin', inviteCode } = options;
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
            (error as { name?: unknown }).name === 'AuthFlowCanceled'
          ) {
            return;
          }

          Libs.Logger.error('Authorization promise rejected:', error);
          if (!isMountedRef.current) return;

          if (isAuthFlowExpiredError(error)) {
            setUrl('');
            setIsExpired(true);
            return;
          }

          Molecules.toast({
            title: t('authNotCompletedTitle'),
            description: t('authNotCompletedDescription'),
          });
        });

      if (!isMountedRef.current) return;
      setUrl(authorizationUrl ?? '');
    } catch (error) {
      Libs.Logger.error('Failed to generate auth URL:', error);
      if (!isMountedRef.current) return;
      Molecules.toast({
        title: t('qrGenerationFailedTitle'),
        description: t('qrGenerationFailedDescription'),
      });
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [type, inviteCode, t]);

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
