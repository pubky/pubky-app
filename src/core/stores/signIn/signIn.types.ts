import type { AppError } from '@/libs/error/error';

export interface SignInState {
  /** Auth URL callback successfully resolved (20%) */
  authUrlResolved: boolean;
  /** Profile check completed (40%) */
  profileChecked: boolean;
  /** Bootstrap data fetched from Nexus (60%) */
  bootstrapFetched: boolean;
  /** Data persisted to IndexedDB (80%) */
  dataPersisted: boolean;
  /** Homeserver data synced: last_read, settings (100%) */
  homeserverSynced: boolean;
  /** Error that occurred during sign-in, if any */
  error: AppError | null;
}

export interface SignInActions {
  setAuthUrlResolved: (value: boolean) => void;
  setProfileChecked: (value: boolean) => void;
  setBootstrapFetched: (value: boolean) => void;
  setDataPersisted: (value: boolean) => void;
  setHomeserverSynced: (value: boolean) => void;
  setError: (error: AppError | null) => void;
  reset: () => void;
}

export type SignInStore = SignInState & SignInActions;

export const signInInitialState: SignInState = {
  authUrlResolved: false,
  profileChecked: false,
  bootstrapFetched: false,
  dataPersisted: false,
  homeserverSynced: false,
  error: null,
};

export enum SignInActionTypes {
  SET_AUTH_URL_RESOLVED = 'SET_AUTH_URL_RESOLVED',
  SET_PROFILE_CHECKED = 'SET_PROFILE_CHECKED',
  SET_BOOTSTRAP_FETCHED = 'SET_BOOTSTRAP_FETCHED',
  SET_DATA_PERSISTED = 'SET_DATA_PERSISTED',
  SET_HOMESERVER_SYNCED = 'SET_HOMESERVER_SYNCED',
  SET_ERROR = 'SET_ERROR',
  RESET = 'RESET',
}
