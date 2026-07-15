import type { Session as LocksSdkSession } from '@pubky/locks-sdk';

export interface LocksAuthInitParams {
  session: LocksSdkSession | null;
  /** Bearer secret to persist so the session can be restored on reload. */
  secret: string | null;
}

export interface LocksAuthState {
  /** Live SDK session (in-memory only; not serializable). */
  session: LocksSdkSession | null;
  /** Persisted bearer secret; the live session is rebuilt from it on load. */
  locksSessionSecret: string | null;
  // TODO: when locks-sdk exposes the creator pubky on `Session`, store it here as `creatorPubky`
  // (mirroring the homeserver store's `currentUserPubky`). Callers then read it from the store
  // instead of extracting `creator` from Lock Server responses (`LocksService`).
  hasHydrated: boolean;
}

export interface LocksAuthActions {
  init: (params: LocksAuthInitParams) => void;
  reset: () => void;
  /** Set the live session without touching the persisted secret (used on restore). */
  setSession: (session: LocksSdkSession | null) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

export interface LocksAuthSelectors {
  selectIsLocksAuthenticated: () => boolean;
  selectLocksSession: () => LocksSdkSession | null;
  selectLocksSessionSecret: () => string | null;
}

export type LocksAuthStore = LocksAuthState & LocksAuthActions & LocksAuthSelectors;

export const locksAuthInitialState: LocksAuthState = {
  session: null,
  locksSessionSecret: null,
  hasHydrated: false,
};

export enum LocksAuthActionTypes {
  INIT = 'INIT',
  RESET = 'RESET',
  SET_SESSION = 'SET_SESSION',
  SET_HAS_HYDRATED = 'SET_HAS_HYDRATED',
}
