'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AuthController } from '@/controllers/auth/auth';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { AuthState } from '@/stores/auth/auth.types';
import type { UseRequireAuthResult } from './useRequireAuth.types';

const canActAsAccount = (state: AuthState): boolean =>
  !state.isLoggingOut && state.currentUserPubky !== null && state.session !== null && state.restoreStatus === 'ready';

/** Synchronous UI guards preserve browser activation; mutations await waitForAuth before changing data. */
export function useRequireAuth(active = true): UseRequireAuthResult {
  const isAuthenticated = useAuthStore(canActAsAccount);
  const account = useAuthStore((state) => state.currentUserPubky);
  const generation = useAuthStore((state) => state.generation);
  const pathname = usePathname();
  const scope = useRef(new AbortController());
  const waiting = useRef(new Set<string>());
  const [waitingCount, setWaitingCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    scope.current = controller;
    if (!active) controller.abort();
    return () => controller.abort();
  }, [pathname, active]);

  const requireAuth = <T,>(action: () => T): T | undefined => {
    const state = useAuthStore.getState();
    if (canActAsAccount(state)) return action();
    if (
      state.hasHydrated === false ||
      state.isLoggingOut ||
      state.restoreStatus === 'restoring' ||
      (state.sessionReference && state.restoreStatus === 'idle')
    )
      return undefined;
    if (state.restoreStatus === 'temporary-error') {
      toast({ variant: 'error', description: 'Could not restore your session. Please try again.' });
    } else state.setShowSignInDialog(true);
    return undefined;
  };

  const waitForAuth = async (actionKey = 'default'): Promise<boolean> => {
    const controller = scope.current;
    if (!active || controller.signal.aborted || waiting.current.has(actionKey)) return false;
    waiting.current.add(actionKey);
    setWaitingCount((count) => count + 1);
    const initial = useAuthStore.getState();
    try {
      if (initial.currentUserPubky !== account || initial.generation !== generation) return false;
      const result = await (canActAsAccount(initial) ? 'ready' : AuthController.waitForSession(controller.signal));
      const state = useAuthStore.getState();
      if (
        controller.signal.aborted ||
        state.generation !== initial.generation ||
        state.currentUserPubky !== initial.currentUserPubky ||
        state.isLoggingOut
      )
        return false;
      if (result === 'ready') return canActAsAccount(state);
      if (result === 'sign-in') state.setShowSignInDialog(true);
      else if (result === 'unavailable')
        toast({ variant: 'error', description: 'Could not restore your session. Please try again.' });
      return false;
    } finally {
      waiting.current.delete(actionKey);
      setWaitingCount((count) => count - 1);
    }
  };

  return { isAuthenticated, requireAuth, waitForAuth, isWaiting: waitingCount > 0 };
}
