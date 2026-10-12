import { Session } from '@synonymdev/pubky';
import type { SessionReference, SessionRestoreStatus } from '@/libs/auth/session.types';
import type { Pubky } from '@/models/models.types';

export interface AuthInitParams {
  currentUserPubky: Pubky | null;
  session: Session | null;
  /** null = unknown/undetermined, false = no profile, true = has profile */
  hasProfile: boolean | null;
  sessionReference?: SessionReference | null;
  generation?: string;
  retiringSession?: SessionReference | null;
  pendingRetirements?: SessionReference[];
  restoreStatus?: SessionRestoreStatus;
}

export interface AuthState extends AuthInitParams {
  sessionReference: SessionReference | null;
  generation: string;
  retiringSession: SessionReference | null;
  restoreStatus: SessionRestoreStatus;
  /** This tab changed accounts and must bootstrap before exposing the new session. */
  needsAccountSync: boolean;
  hasHydrated: boolean;
  isRestoringSession: boolean;
  /** Whether the sign-in dialog is open (for unauthenticated users) */
  showSignInDialog: boolean;
  /** Whether a logout is in progress (prevents flash of weird states during logout) */
  isLoggingOut: boolean;
}

export interface AuthActions {
  reset: () => void;
  init: (params: AuthInitParams) => void;
  setCurrentUserPubky: (pubky: Pubky | null) => void;
  setSession: (session: Session | null) => void;
  setNeedsAccountSync: (needed: boolean) => void;
  setRestoreStatus: (status: SessionRestoreStatus) => void;
  setRetiringSession: (reference: SessionReference | null) => void;
  setIsRestoringSession: (isRestoringSession: boolean) => void;
  setHasProfile: (hasProfile: boolean) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
  /** Open or close the sign-in dialog */
  setShowSignInDialog: (show: boolean) => void;
  /** Set whether a logout is in progress */
  setIsLoggingOut: (isLoggingOut: boolean) => void;
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
  sessionReference: null,
  generation: '',
  retiringSession: null,
  pendingRetirements: [],
  restoreStatus: 'idle',
  needsAccountSync: false,
  hasProfile: null,
  hasHydrated: false,
  isRestoringSession: false,
  showSignInDialog: false,
  isLoggingOut: false,
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
}
