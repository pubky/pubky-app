import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { shouldAttemptSessionRestore } from '@/libs/vibe-session/should-restore';
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
        // Only persist essential data
        partialize: (state) => ({
          currentUserPubky: state.currentUserPubky,
          sessionExport: state.sessionExport,
          hasProfile: state.hasProfile,
          hasHydrated: false, // Will be set by rehydration handler
        }),

        // Set hasHydrated to true after rehydration
        onRehydrateStorage: (state) => (rehydratedState) => {
          const resolvedState = rehydratedState ?? state;
          resolvedState.setHasHydrated(true);
          if (shouldAttemptSessionRestore(rehydratedState?.sessionExport)) {
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
