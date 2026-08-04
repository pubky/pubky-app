import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { HOME_PERSIST_KEY } from '../persistedKeys';
import { createHomeActions } from './home.actions';
import { HOME_STORE_VERSION, migrateHomePersistedState } from './home.migrations';
import { homeInitialState, HomeStore } from './home.types';

// Store creation
export const useHomeStore = create<HomeStore>()(
  devtools(
    persist(
      (set) => ({
        ...homeInitialState,
        ...createHomeActions(set),
      }),
      {
        name: HOME_PERSIST_KEY,
        version: HOME_STORE_VERSION,
        migrate: migrateHomePersistedState,
        // Persist all home states
        partialize: (state) => ({
          layout: state.layout,
          sort: state.sort,
          reach: state.reach,
          content: state.content,
          profileTags: state.profileTags,
          taggedAsActive: state.taggedAsActive,
          hasUserSetReach: state.hasUserSetReach,
        }),
        onRehydrateStorage: (state) => (rehydratedState) => {
          (rehydratedState ?? state).setHasHydrated(true);
        },
      },
    ),
    {
      name: 'home-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
