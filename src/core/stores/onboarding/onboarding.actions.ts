import type { Pubky } from '@/models/models.types';
import { type ZustandSet } from '../stores.types';
import {
  type OnboardingActions,
  OnboardingActionTypes,
  onboardingInitialState,
  type OnboardingStore,
  TOnboardingSecrets,
} from './onboarding.types';

export const createOnboardingActions = (set: ZustandSet<OnboardingStore>): OnboardingActions => ({
  reset: () => {
    set(
      (state) => ({
        ...onboardingInitialState,
        hasHydrated: state.hasHydrated, // Preserve hydration state during reset
        // Preserve per-pubky Experience completion: logout and sign-in both call reset(),
        // and a completed account must never be re-prompted with the tags step.
        experienceCompletedByPubky: state.experienceCompletedByPubky,
      }),
      false,
      OnboardingActionTypes.RESET,
    );
  },

  setSecrets: (secrets: TOnboardingSecrets) => {
    set({ ...secrets }, false, OnboardingActionTypes.SET_SECRETS);
  },

  clearSecrets: () => {
    set({ secretKey: null, mnemonic: null }, false, OnboardingActionTypes.CLEAR_SECRETS);
  },

  setHydrated: (hasHydrated: boolean) => {
    set({ hasHydrated }, false, OnboardingActionTypes.SET_HYDRATED);
  },

  setShowWelcomeDialog: (showWelcomeDialog: boolean) => {
    set({ showWelcomeDialog }, false, OnboardingActionTypes.SET_SHOW_WELCOME_DIALOG);
  },

  setInviteCode: (inviteCode: string) => {
    set({ inviteCode }, false, OnboardingActionTypes.SET_INVITE_CODE);
  },

  setInterestTags: (interestTags: string[]) => {
    set({ interestTags }, false, OnboardingActionTypes.SET_INTEREST_TAGS);
  },

  markExperienceCompleted: (pubky: Pubky) => {
    set(
      (state) => ({
        experienceCompletedByPubky: { ...state.experienceCompletedByPubky, [pubky]: true as const },
      }),
      false,
      OnboardingActionTypes.MARK_EXPERIENCE_COMPLETED,
    );
  },

  clearExperienceCompleted: (pubky: Pubky) => {
    set(
      (state) => {
        const experienceCompletedByPubky = { ...state.experienceCompletedByPubky };
        delete experienceCompletedByPubky[pubky];
        return { experienceCompletedByPubky };
      },
      false,
      OnboardingActionTypes.CLEAR_EXPERIENCE_COMPLETED,
    );
  },
});
