'use client';

import { useTranslations } from 'next-intl';

import * as Core from '@/core';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';

import type { UseInviteCodeSignUpResult } from './useInviteCodeSignUp.types';

const SIGN_UP_MAX_ATTEMPTS = 4;
const SIGN_UP_RETRY_BASE_DELAY_MS = 500;
const SIGN_UP_RETRY_MAX_DELAY_MS = 5000;

/**
 * Validates an invite code by generating keys and attempting signup.
 * There is no "validate only" API; the homeserver validates during signup.
 *
 * Only the onboarding store is written until signup succeeds; the auth store is updated
 * only when AuthController.signUp succeeds (session, currentUserPubky, hasProfile).
 *
 * On success the generated keys become the user's real keys (used on /onboarding/pubky).
 * On non-retryable failure clears onboarding secrets; on retryable failure keeps secrets so users can retry safely.
 * In both failure paths it shows a toast and throws so the caller can keep the user on the form.
 *
 * @example
 * const { validateAndSignUp } = useInviteCodeSignUp();
 * async function onSuccess(inviteCode: string) {
 *   await validateAndSignUp(inviteCode);
 *   setInviteCode(inviteCode);
 *   router.push(ONBOARDING_ROUTES.INSTALL);
 * }
 */
export function useInviteCodeSignUp(): UseInviteCodeSignUpResult {
  const { toast } = Molecules.useToast();
  const t = useTranslations('onboarding.pubky');

  const getRetryDelayMs = (attempt: number, retryAfterSeconds?: number): number => {
    if (typeof retryAfterSeconds === 'number' && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return Math.min(retryAfterSeconds * 1000, SIGN_UP_RETRY_MAX_DELAY_MS);
    }

    return Math.min(SIGN_UP_RETRY_BASE_DELAY_MS * 2 ** attempt, SIGN_UP_RETRY_MAX_DELAY_MS);
  };

  const sleep = async (ms: number): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  };

  async function validateAndSignUp(inviteCode: string) {
    let secretKey = Core.useOnboardingStore.getState().secretKey;
    if (!secretKey) {
      Core.ProfileController.generateSecretsForSignUp();
      secretKey = Core.useOnboardingStore.getState().selectSecretKey();
    }

    if (!secretKey) {
      throw new Error('[useInviteCodeSignUp] No secret key after generateSecretsForSignUp');
    }

    let lastError: unknown;

    for (let attempt = 0; attempt < SIGN_UP_MAX_ATTEMPTS; attempt += 1) {
      let description = t('signUpError');

      try {
        await Core.AuthController.signUp({ secretKey, signupToken: inviteCode });
        return;
      } catch (error) {
        lastError = error;

        const canRetry = Libs.isAppError(error) && Libs.isRetryable(error) && attempt < SIGN_UP_MAX_ATTEMPTS - 1;
        if (canRetry) {
          const retryAfter = Libs.getRetryAfter(error);
          await sleep(getRetryDelayMs(attempt, retryAfter));
          continue;
        }

        // Keep secrets for retryable failures to avoid losing a paid signup when transport fails.
        if (!(Libs.isAppError(error) && Libs.isRetryable(error))) {
          Core.useOnboardingStore.getState().clearSecrets();
        }

        if (Libs.isAppError(error)) {
          if (Libs.isAuthError(error)) {
            description = t('invalidInvite');
          } else if (error.message) {
            description = error.message;
          }
        }

        toast({
          title: t('signUpFailed'),
          description,
        });
        throw error;
      }
    }

    throw lastError ?? new Error('[useInviteCodeSignUp] Sign-up failed after retries');
  }

  return { validateAndSignUp };
}
