import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { createAuthStorage } from '@/libs/auth/persistence';
import { persistedAuthSchema } from '@/libs/auth/session.types';
import { AUTH_PERSIST_KEY, AUTH_STORE_VERSION } from '../persistedKeys';
import { createAuthActions } from './auth.actions';
import { createAuthSelectors } from './auth.selectors';
import { authInitialState, AuthStore } from './auth.types';

// Store creation
export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...authInitialState,
        ...createAuthActions(set),
        ...createAuthSelectors(get),
      }),
      {
        name: AUTH_PERSIST_KEY,
        version: AUTH_STORE_VERSION,
        storage: createJSONStorage(() => createAuthStorage(() => localStorage)),
        merge: (persisted, current) => {
          if (!persisted) return current;
          const data = persistedAuthSchema.parse(persisted);
          const sameGeneration = data.generation === current.generation;
          return {
            ...current,
            ...data,
            session: sameGeneration ? current.session : null,
            restoreStatus:
              data.currentUserPubky && !data.sessionReference
                ? 'reauth-required'
                : sameGeneration
                  ? current.restoreStatus
                  : 'idle',
            isRestoringSession: sameGeneration ? current.isRestoringSession : false,
          };
        },
        // Only persist essential data
        partialize: (state) => ({
          currentUserPubky: state.currentUserPubky,
          sessionReference: state.sessionReference,
          generation: state.generation,
          retiringSession: state.retiringSession,
          pendingRetirements: state.pendingRetirements,
          hasProfile: state.hasProfile,
        }),

        // Set hasHydrated to true after rehydration
        onRehydrateStorage: (state) => (rehydratedState, error) => {
          const resolvedState = rehydratedState ?? state;
          resolvedState.setHasHydrated(true);
          if (error) resolvedState.setRestoreStatus('temporary-error');
        },
      },
    ),
    {
      name: 'auth-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
