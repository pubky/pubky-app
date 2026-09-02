import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { ONBOARDING_PERSIST_KEY } from '../persistedKeys';
import { createOnboardingActions } from './onboarding.actions';
import { createOnboardingSelectors } from './onboarding.selectors';
import { onboardingInitialState, type OnboardingStore } from './onboarding.types';

// Store creation
export const useOnboardingStore = create<OnboardingStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...onboardingInitialState,
        ...createOnboardingActions(set),
        ...createOnboardingSelectors(get),
      }),
      {
        name: ONBOARDING_PERSIST_KEY,

        // Persist keys data
        partialize: (state) => ({
          secretKey: state.secretKey,
          mnemonic: state.mnemonic,
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
