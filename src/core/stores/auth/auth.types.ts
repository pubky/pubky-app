import { Session } from '@synonymdev/pubky';
import type { Pubky } from '@/models/models.types';

export interface AuthInitParams {
  currentUserPubky: Pubky | null;
  session: Session | null;
  /** null = unknown/undetermined, false = no profile, true = has profile */
  hasProfile: boolean | null;
}

export interface AuthState extends AuthInitParams {
  sessionExport: string | null;
  hasHydrated: boolean;
  isRestoringSession: boolean;
  /** Whether the sign-in dialog is open (for unauthenticated users) */
  showSignInDialog: boolean;
  /** Whether a logout is in progress (prevents flash of weird states during logout) */
  isLoggingOut: boolean;
  /**
   * Transient persist restore failed and the export was kept. Not persisted.
   * useAuthStatus treats this as terminal unauthenticated (not loading).
   */
  sessionRestoreDeferred: boolean;
}

export interface AuthActions {
  reset: () => void;
  init: (params: AuthInitParams) => void;
  setCurrentUserPubky: (pubky: Pubky | null) => void;
  setSession: (session: Session | null) => void;
  setIsRestoringSession: (isRestoringSession: boolean) => void;
  setHasProfile: (hasProfile: boolean) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
  /** Open or close the sign-in dialog */
  setShowSignInDialog: (show: boolean) => void;
  /** Set whether a logout is in progress */
  setIsLoggingOut: (isLoggingOut: boolean) => void;
  /** Mark persist restore as deferred (terminal unauthenticated, export kept) */
  setSessionRestoreDeferred: (sessionRestoreDeferred: boolean) => void;
}

export interface AuthSelectors {
  selectCurrentUserPubky: () => Pubky;
  selectIsAuthenticated: () => boolean;
  selectSession: () => Session | null;
}

export type AuthStore = AuthState & AuthActions & AuthSelectors;

export const authInitialState: AuthState = {
  currentUserPubky: null,
  session: null,
  sessionExport: null,
  hasProfile: null,
  hasHydrated: false,
  isRestoringSession: false,
  showSignInDialog: false,
  isLoggingOut: false,
  sessionRestoreDeferred: false,
};

export enum AuthActionTypes {
  INIT = 'INIT',
  RESET = 'RESET',
  SET_PUBKY = 'SET_PUBKY',
  SET_SESSION = 'SET_SESSION',
  CLEAR_SESSION = 'CLEAR_SESSION',
  SET_IS_RESTORING_SESSION = 'SET_IS_RESTORING_SESSION',
  SET_HAS_PROFILE = 'SET_HAS_PROFILE',
  SET_HAS_HYDRATED = 'SET_HAS_HYDRATED',
  SET_SHOW_SIGN_IN_DIALOG = 'SET_SHOW_SIGN_IN_DIALOG',
  SET_IS_LOGGING_OUT = 'SET_IS_LOGGING_OUT',
  SET_SESSION_RESTORE_DEFERRED = 'SET_SESSION_RESTORE_DEFERRED',
}
