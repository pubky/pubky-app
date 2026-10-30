import { useAuthStore } from '@/stores/auth/auth.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { AuthStatus, type AuthStatusResult } from './useAuthStatus.types';

export function useAuthStatus(): AuthStatusResult {
  const onboarding = useOnboardingStore();
  const auth = useAuthStore();
  const pending = auth.sessionReference !== null && auth.session === null && auth.restoreStatus === 'idle';
  const isLoading = !onboarding.hasHydrated || !auth.hasHydrated || auth.restoreStatus === 'restoring' || pending;
  const hasKeypair = auth.session !== null;
  const hasProfile = auth.hasProfile;
  // A retained handle after failed bootstrap is not a ready session for route access.
  const needsSignIn = auth.restoreStatus === 'reauth-required' || auth.restoreStatus === 'temporary-error';
  // The gate holds the session out of the store, so it is decided before the session checks (not loading: the
  // route guard must redirect to /migration).
  const status = needsSignIn
    ? AuthStatus.UNAUTHENTICATED
    : auth.restoreStatus === 'social-migration'
      ? AuthStatus.NEEDS_SOCIAL_MIGRATION
      : hasKeypair && hasProfile === true
        ? AuthStatus.AUTHENTICATED
        : hasKeypair && hasProfile === false
          ? AuthStatus.NEEDS_PROFILE_CREATION
          : AuthStatus.UNAUTHENTICATED;
  return { status, isLoading, hasKeypair, hasProfile, isFullyAuthenticated: status === AuthStatus.AUTHENTICATED };
}
