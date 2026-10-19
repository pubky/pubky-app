import type { Session as LocksSdkSession } from '@synonymdev/locks-sdk';
import type { Pubky } from '@/models/models.types';

export interface LocksAuthInitParams {
  session: LocksSdkSession | null;
  /** Bearer secret to persist so the session can be restored on reload. */
  secret: string | null;
  /** Account the secret was issued to, as verified by the code exchange. */
  creatorPubky: Pubky | null;
}

export interface LocksAuthState {
  /** Live SDK session (in-memory only; not serializable). */
  session: LocksSdkSession | null;
  /** Persisted bearer secret; the live session is rebuilt from it on load. */
  locksSessionSecret: string | null;
  // TODO:[Locks] #2283 — callers should read the creator from here instead of extracting `creator`
  // from Lock Server responses (`LocksService`).
  /** Persisted with the secret: a session rebuilt by `restoreSession` has no `creatorPubky()`. */
  creatorPubky: Pubky | null;
  /**
   * This Locks session's answer to "is the creator's Paykit setup done", from the setup-status check
   * or a completed setup. In memory only: the next session asks the Lock Server again (#2627).
   */
  paykitConnected: boolean;
  hasHydrated: boolean;
}

export interface LocksAuthActions {
  init: (params: LocksAuthInitParams) => void;
  reset: () => void;
  /** Set the live session without touching the persisted secret (used on restore). */
  setSession: (session: LocksSdkSession | null) => void;
  setPaykitConnected: (connected: boolean) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

export interface LocksAuthSelectors {
  selectIsLocksAuthenticated: () => boolean;
  selectLocksSession: () => LocksSdkSession | null;
  selectLocksSessionSecret: () => string | null;
  selectLocksCreatorPubky: () => Pubky | null;
  selectIsPaykitConnected: () => boolean;
}

export type LocksAuthStore = LocksAuthState & LocksAuthActions & LocksAuthSelectors;

export const locksAuthInitialState: LocksAuthState = {
  session: null,
  locksSessionSecret: null,
  creatorPubky: null,
  paykitConnected: false,
  hasHydrated: false,
};

export enum LocksAuthActionTypes {
  INIT = 'INIT',
  RESET = 'RESET',
  SET_SESSION = 'SET_SESSION',
  SET_PAYKIT_CONNECTED = 'SET_PAYKIT_CONNECTED',
  SET_HAS_HYDRATED = 'SET_HAS_HYDRATED',
}
