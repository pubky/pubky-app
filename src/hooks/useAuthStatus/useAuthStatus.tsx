import { useMemo } from 'react';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { AuthStatus, type AuthStatusResult } from './useAuthStatus.types';

export function useAuthStatus(): AuthStatusResult {
  // Get state from stores
  const onboardingStore = useOnboardingStore();
  const authStore = useAuthStore();

  const authStatusResult = useMemo((): AuthStatusResult => {
    // On page reload sessionExport (serialized credentials in localStorage) is restored
    // before session (live auth object) is recreated. This flag prevents premature
    // redirects by keeping isLoading true until session restoration is completed.
    const isSessionRestorePending =
      authStore.sessionExport !== null && authStore.session === null && !authStore.sessionRestoreDeferred;

    const isLoading =
      !onboardingStore.hasHydrated || !authStore.hasHydrated || authStore.isRestoringSession || isSessionRestorePending;

    // Check if user has keypair (session)
    const hasKeypair = authStore.session !== null;

    // Check if user has profile data
    const hasProfile = authStore.hasProfile;

    // Determine the authentication status
    let status: AuthStatus;

    // User has session but explicitly no profile - needs to complete onboarding submitting the profile.json
    if (hasKeypair && hasProfile === false) {
      status = AuthStatus.NEEDS_PROFILE_CREATION;
    }
    // User has profile - fully authenticated
    else if (hasKeypair && hasProfile === true) {
      status = AuthStatus.AUTHENTICATED;
    }
    // No session OR hasProfile is null (still determining) - unauthenticated
    else {
      status = AuthStatus.UNAUTHENTICATED;
    }

    return {
      status,
      isLoading,
      hasKeypair,
      hasProfile,
      isFullyAuthenticated: status === AuthStatus.AUTHENTICATED,
    };
  }, [
    onboardingStore.hasHydrated,
    authStore.hasHydrated,
    authStore.isRestoringSession,
    authStore.sessionExport,
    authStore.session,
    authStore.sessionRestoreDeferred,
    authStore.hasProfile,
  ]);

  return authStatusResult;
}
