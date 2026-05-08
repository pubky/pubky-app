import { Session } from '@synonymdev/pubky';
import type { Pubky } from '@/models/models.types';
import { ZustandSet } from '../stores.types';
import { AuthActions, AuthActionTypes, authInitialState, AuthInitParams, AuthStore } from './auth.types';

const safeSessionExport = (session: Session | null): string | null => {
  if (!session) return null;
  try {
    if (typeof session.export === 'function') {
      return session.export();
    }
  } catch {
    // ignore export errors; session persistence is best-effort here
  }
  return null;
};

// Actions/Mutators - State modification functions
export const createAuthActions = (set: ZustandSet<AuthStore>): AuthActions => ({
  init: ({ session, currentUserPubky, hasProfile }: AuthInitParams) => {
    set(
      (state) => ({
        ...state,
        session,
        sessionExport: safeSessionExport(session),
        currentUserPubky,
        hasProfile,
      }),
      false,
      AuthActionTypes.INIT,
    );
  },
  // Storage management
  reset: () => {
    set(
      (state) => ({
        ...authInitialState,
        hasHydrated: state.hasHydrated, // Preserve hydration state
        isLoggingOut: state.isLoggingOut, // Preserve logout state to prevent UI flash
      }),
      false,
      AuthActionTypes.RESET,
    );
  },
  // Authentication data management
  setCurrentUserPubky: (pubky: Pubky | null) => {
    set({ currentUserPubky: pubky }, false, AuthActionTypes.SET_PUBKY);
  },

  setSession: (session: Session | null) => {
    set({ session, sessionExport: safeSessionExport(session) }, false, AuthActionTypes.SET_SESSION);
  },

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
