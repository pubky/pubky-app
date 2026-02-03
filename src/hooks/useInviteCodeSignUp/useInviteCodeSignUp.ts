'use client';

import { useTranslations } from 'next-intl';

import * as Core from '@/core';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';

import type { UseInviteCodeSignUpResult } from './useInviteCodeSignUp.types';

/**
 * Validates an invite code by generating keys and attempting signup.
 * There is no "validate only" API; the homeserver validates during signup.
 *
 * Only the onboarding store is written until signup succeeds; the auth store is updated
 * only when AuthController.signUp succeeds (session, currentUserPubky, hasProfile).
 *
 * On success the generated keys become the user's real keys (used on /onboarding/pubky).
 * On failure clears onboarding secrets, shows toast, and throws so the caller can keep the user on the form.
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

  async function validateAndSignUp(inviteCode: string) {
    Core.ProfileController.generateSecretsForSignUp();
    const secretKey = Core.useOnboardingStore.getState().selectSecretKey();
    if (!secretKey) {
      throw new Error('[useInviteCodeSignUp] No secret key after generateSecretsForSignUp');
    }

    try {
      await Core.AuthController.signUp({ secretKey, signupToken: inviteCode });
    } catch (error) {
      Core.useOnboardingStore.getState().clearSecrets();

      let description = t('signUpError');
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

  return { validateAndSignUp };
}
