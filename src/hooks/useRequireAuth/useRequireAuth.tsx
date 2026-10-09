'use client';

import { useAuthStore } from '@/stores/auth/auth.store';
import type { AuthState } from '@/stores/auth/auth.types';
import type { UseRequireAuthResult } from './useRequireAuth.types';

/**
 * Hook for handling authentication requirements in components.
 *
 * Provides:
 * - `isAuthenticated`: boolean indicating if user is logged in
 * - `requireAuth`: wrapper function that either executes the action or opens sign-in dialog
 *
 * The sign-in dialog state is managed globally in authStore.
 * DialogSignIn should be rendered once in the app layout, not in individual components.
 */
const canActAsAccount = (state: Pick<AuthState, 'currentUserPubky' | 'session' | 'restoreStatus'>): boolean =>
  state.currentUserPubky !== null && state.session !== null && state.restoreStatus === 'ready';

export function useRequireAuth(): UseRequireAuthResult {
  const isAuthenticated = useAuthStore(canActAsAccount);

  const requireAuth = <T,>(action: () => T): T | undefined => {
    // Use getState() directly to avoid stale closure - auth state may change between
    // when this callback is created and when it's executed (e.g., user logs in/out)
    const state = useAuthStore.getState();
    if (canActAsAccount(state)) {
      return action();
    }
    state.setShowSignInDialog(true);
    return undefined;
  };

  return {
    isAuthenticated,
    requireAuth,
  };
}
