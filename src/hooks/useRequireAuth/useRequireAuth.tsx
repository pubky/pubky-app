'use client';

import { useCallback } from 'react';
import type { UseRequireAuthResult } from './useRequireAuth.types';
import { useAuthStore } from '@/stores/auth/auth.store';
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
export function useRequireAuth(): UseRequireAuthResult {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const isAuthenticated = Boolean(currentUserPubky);

  const requireAuth = useCallback(<T,>(action: () => T): T | undefined => {
    // Use getState() directly to avoid stale closure - auth state may change between
    // when this callback is created and when it's executed (e.g., user logs in/out)
    const state = useAuthStore.getState();
    if (state.currentUserPubky) {
      return action();
    }
    state.setShowSignInDialog(true);
    return undefined;
  }, []);

  return {
    isAuthenticated,
    requireAuth,
  };
}
