import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { createAuthStorage } from '@/libs/auth/persistence';
import { persistedAuthSchema } from '@/libs/auth/session.types';
import { AUTH_PERSIST_KEY } from '../persistedKeys';
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
        version: 2,
        storage: createJSONStorage(() => createAuthStorage(localStorage)),
        merge: (persisted, current) => {
          if (!persisted) return current;
          const data = persistedAuthSchema.parse(persisted);
          const sameGeneration = data.generation === current.generation;
          return {
            ...current,
            ...data,
            session: sameGeneration ? current.session : null,
            sessionExport: data.sessionReference?.kind === 'cookie' ? data.sessionReference.sessionExport : null,
            restoreStatus: sameGeneration ? current.restoreStatus : 'idle',
            isRestoringSession: sameGeneration ? current.isRestoringSession : false,
          };
        },
        // Only persist essential data
        partialize: (state) => ({
          currentUserPubky: state.currentUserPubky,
          sessionReference: state.sessionReference,
          generation: state.generation,
          retiringSession: state.retiringSession,
          hasProfile: state.hasProfile,
        }),

        // Set hasHydrated to true after rehydration
        onRehydrateStorage: (state) => (rehydratedState, error) => {
          const resolvedState = rehydratedState ?? state;
          resolvedState.setHasHydrated(true);
          if (error) resolvedState.setRestoreStatus('temporary-error');
          if (rehydratedState?.sessionReference && !rehydratedState.session) {
            resolvedState.setIsRestoringSession(true);
          }
        },
      },
    ),
    {
      name: 'auth-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
