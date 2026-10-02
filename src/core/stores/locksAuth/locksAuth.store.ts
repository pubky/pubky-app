import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { LOCKS_AUTH_PERSIST_KEY } from '../persistedKeys';
import { createLocksAuthActions } from './locksAuth.actions';
import { createLocksAuthSelectors } from './locksAuth.selectors';
import { locksAuthInitialState, LocksAuthStore } from './locksAuth.types';

/**
 * Persists the Lock Server bearer secret to localStorage; the live session is rebuilt from it on
 * load. Same shape and lifecycle as the homeserver `auth-store`.
 *
 * Once private homeserver storage lands (pubky/pubky-core#426), the secret could live in the user's
 * homeserver `/priv` and be fetched on demand instead of localStorage, giving device independence.
 */
export const useLocksAuthStore = create<LocksAuthStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...locksAuthInitialState,
        ...createLocksAuthActions(set),
        ...createLocksAuthSelectors(get),
      }),
      {
        name: LOCKS_AUTH_PERSIST_KEY,
        // Only the bearer secret persists; the live session is rebuilt from it on load.
        partialize: (state) => ({
          locksSessionSecret: state.locksSessionSecret,
          hasHydrated: false, // set by the rehydration handler
        }),
        onRehydrateStorage: () => (state) => {
          state?.setHasHydrated(true);
        },
      },
    ),
    {
      name: LOCKS_AUTH_PERSIST_KEY,
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
