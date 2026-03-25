import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { AuthStore, authInitialState } from './auth.types';
import { createAuthActions } from './auth.actions';
import { createAuthSelectors } from './auth.selectors';
import { AUTH_PERSIST_KEY } from '../persistedKeys';

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
        onRehydrateStorage: () => (state) => {
          if (state) {
            state.setHasHydrated(true);
            if (state.sessionExport) {
              state.setIsRestoringSession(true);
            }
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
