import { Session } from '@synonymdev/pubky';
import type { Pubky } from '@/models/models.types';
import { usePubchiStore } from '@/stores/pubchi/pubchi.store';
import { ZustandSet } from '../stores.types';
import { AuthActions, AuthActionTypes, authInitialState, AuthInitParams, AuthStore } from './auth.types';

// Actions/Mutators - State modification functions
export const createAuthActions = (set: ZustandSet<AuthStore>): AuthActions => ({
  init: ({
    session,
    currentUserPubky,
    hasProfile,
    sessionReference = null,
    generation,
    shopCleanupEpoch,
    retiringSession = null,
    pendingRetirements = [],
    restoreStatus = session ? 'ready' : currentUserPubky && !sessionReference ? 'reauth-required' : 'idle',
  }: AuthInitParams) => {
    if (!session || usePubchiStore.getState().ownerPubky !== currentUserPubky) usePubchiStore.getState().clear();
    set(
      (state) => ({
        ...state,
        session,
        sessionReference,
        generation: generation ?? crypto.randomUUID(),
        shopCleanupEpoch: shopCleanupEpoch ?? state.shopCleanupEpoch,
        retiringSession,
        pendingRetirements,
        restoreStatus,
        isRestoringSession: restoreStatus === 'restoring',
        showSignInDialog: restoreStatus === 'ready' ? false : state.showSignInDialog,
        currentUserPubky,
        hasProfile,
      }),
      false,
      AuthActionTypes.INIT,
    );
  },
  // Storage management
  reset: () => {
    usePubchiStore.getState().clear();
    set(
      (state) => ({
        ...authInitialState,
        generation: state.generation,
        shopCleanupEpoch: state.shopCleanupEpoch,
        hasHydrated: state.hasHydrated, // Preserve hydration state
        isLoggingOut: state.isLoggingOut, // Preserve logout state to prevent UI flash
        pendingRetirements: state.pendingRetirements,
        retiringSession: state.retiringSession,
      }),
      false,
      AuthActionTypes.RESET,
    );
  },
  // Authentication data management
  setCurrentUserPubky: (pubky: Pubky | null) => {
    if (usePubchiStore.getState().ownerPubky !== pubky) usePubchiStore.getState().clear();
    set({ currentUserPubky: pubky }, false, AuthActionTypes.SET_PUBKY);
  },

  setSession: (session: Session | null) => {
    if (!session) usePubchiStore.getState().clear();
    set({ session }, false, AuthActionTypes.SET_SESSION);
  },

  setNeedsAccountSync: (needsAccountSync) => set({ needsAccountSync }),
  setRestoreStatus: (restoreStatus) =>
    set((state) => ({
      restoreStatus,
      isRestoringSession: restoreStatus === 'restoring',
      showSignInDialog: restoreStatus === 'ready' ? false : state.showSignInDialog,
    })),
  setRetiringSession: (retiringSession) => set({ retiringSession }),

  setIsRestoringSession: (isRestoringSession: boolean) => {
    set({ isRestoringSession }, false, AuthActionTypes.SET_IS_RESTORING_SESSION);
  },

  setHasProfile: (hasProfile: boolean) => {
    set({ hasProfile }, false, AuthActionTypes.SET_HAS_PROFILE);
  },

  setHasHydrated: (hasHydrated: boolean) => {
    set({ hasHydrated }, false, AuthActionTypes.SET_HAS_HYDRATED);
  },

  setShowSignInDialog: (showSignInDialog: boolean) => {
    set({ showSignInDialog }, false, AuthActionTypes.SET_SHOW_SIGN_IN_DIALOG);
  },

  setIsLoggingOut: (isLoggingOut: boolean) => {
    set({ isLoggingOut }, false, AuthActionTypes.SET_IS_LOGGING_OUT);
  },
});
