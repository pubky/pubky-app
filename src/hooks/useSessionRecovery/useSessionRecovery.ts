import { useState } from 'react';
import { AuthController } from '@/controllers/auth/auth';
import { isAuthFlowCanceledError } from '@/libs/error/auth-flow-canceled';
import { Identity } from '@/libs/identity/identity';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';

export function useSessionRecovery() {
  // The controller owns restore status and concurrent retries; keep rejected restores out of click handlers.
  const secret = useOnboardingStore((state) => state.secretKey);
  const pubky = useAuthStore((state) => state.currentUserPubky);
  const [isRecoveringKey, setIsRecoveringKey] = useState(false);
  return {
    retry: () => AuthController.restorePersistedSession().catch(() => false),
    hasSavedKey: Boolean(secret && pubky && Identity.tryZ32FromSecret(secret) === pubky),
    isRecoveringKey,
    recoverSavedKey: async () => {
      if (isRecoveringKey) return;
      setIsRecoveringKey(true);
      try {
        let signedIn = await AuthController.loginWithSavedKey();
        if (!signedIn) {
          // A repaired PKARR record needs one more signin, still for this exact retained key/account.
          if (useAuthStore.getState().currentUserPubky !== pubky || useOnboardingStore.getState().secretKey !== secret)
            return;
          signedIn = await AuthController.loginWithSavedKey();
        }
        if (!signedIn) toast({ variant: 'error', description: 'Could not sign in with the saved key. Try again.' });
      } catch (error) {
        if (!isAuthFlowCanceledError(error))
          toast({ variant: 'error', description: 'Could not sign in with the saved key. Your backup is still here.' });
      } finally {
        setIsRecoveringKey(false);
      }
    },
  };
}
