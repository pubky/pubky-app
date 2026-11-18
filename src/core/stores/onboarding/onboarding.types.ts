import type { Pubky } from '@/models/models.types';

export interface OnboardingState {
  hasHydrated: boolean;
  showWelcomeDialog: boolean;
  inviteCode: string;
  /** Ordered interest tags selected on the Tags of interest step (canonical: trimmed, lowercase). */
  interestTags: string[];
  /**
   * Pubkys that finished the onboarding Experience (tags step). Keyed per account so a
   * different user on the same browser is still prompted. Deliberately survives `reset()`
   * — logout and sign-in both reset this store, and completion must outlive them.
   */
  experienceCompletedByPubky: Record<Pubky, true>;
}

export interface OnboardingActions {
  reset: () => void;
  setInviteCode: (inviteCode: string) => void;
  setHydrated: (hasHydrated: boolean) => void;
  setShowWelcomeDialog: (show: boolean) => void;
  setInterestTags: (interestTags: string[]) => void;
  markExperienceCompleted: (pubky: Pubky) => void;
  clearExperienceCompleted: (pubky: Pubky) => void;
}

export type OnboardingStore = OnboardingState & OnboardingActions;

export const onboardingInitialState: OnboardingState = {
  hasHydrated: false,
  showWelcomeDialog: false,
  inviteCode: '',
  interestTags: [],
  experienceCompletedByPubky: {},
};

export enum OnboardingActionTypes {
  RESET = 'RESET',
  SET_HYDRATED = 'SET_HYDRATED',
  SET_SHOW_WELCOME_DIALOG = 'SET_SHOW_WELCOME_DIALOG',
  SET_INVITE_CODE = 'SET_INVITE_CODE',
  SET_INTEREST_TAGS = 'SET_INTEREST_TAGS',
  MARK_EXPERIENCE_COMPLETED = 'MARK_EXPERIENCE_COMPLETED',
  CLEAR_EXPERIENCE_COMPLETED = 'CLEAR_EXPERIENCE_COMPLETED',
}
