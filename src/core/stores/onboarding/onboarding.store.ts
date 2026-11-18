import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { ONBOARDING_PERSIST_KEY } from '../persistedKeys';
import { createOnboardingActions } from './onboarding.actions';
import { migrateOnboardingPersistedState, ONBOARDING_STORE_VERSION } from './onboarding.migrations';
import { onboardingInitialState, type OnboardingStore } from './onboarding.types';

// Store creation
export const useOnboardingStore = create<OnboardingStore>()(
  devtools(
    persist(
      (set) => ({
        ...onboardingInitialState,
        ...createOnboardingActions(set),
      }),
      {
        name: ONBOARDING_PERSIST_KEY,
        version: ONBOARDING_STORE_VERSION,
        migrate: migrateOnboardingPersistedState,

        partialize: (state) => ({
          showWelcomeDialog: state.showWelcomeDialog,
          inviteCode: state.inviteCode,
          interestTags: state.interestTags,
          experienceCompletedByPubky: state.experienceCompletedByPubky,
          hasHydrated: false, // Will be set by rehydration handler
        }),

        // Set hasHydrated to true after rehydration
        onRehydrateStorage: () => (state) => {
          if (state) {
            state.setHydrated(true);
          }
        },
      },
    ),
    {
      name: 'onboarding-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
