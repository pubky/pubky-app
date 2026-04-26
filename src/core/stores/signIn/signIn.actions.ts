import { SignInStore, signInInitialState, SignInActionTypes } from './signIn.types';
import type { ZustandSet } from '../stores.types';
import type { AppError } from '@/libs/error/error';

export const createSignInActions = (set: ZustandSet<SignInStore>) => ({
  setAuthUrlResolved: (value: boolean) =>
    set({ authUrlResolved: value }, false, SignInActionTypes.SET_AUTH_URL_RESOLVED),

  setProfileChecked: (value: boolean) => set({ profileChecked: value }, false, SignInActionTypes.SET_PROFILE_CHECKED),

  setBootstrapFetched: (value: boolean) =>
    set({ bootstrapFetched: value }, false, SignInActionTypes.SET_BOOTSTRAP_FETCHED),

  setDataPersisted: (value: boolean) => set({ dataPersisted: value }, false, SignInActionTypes.SET_DATA_PERSISTED),

  setHomeserverSynced: (value: boolean) =>
    set({ homeserverSynced: value }, false, SignInActionTypes.SET_HOMESERVER_SYNCED),

  setError: (error: AppError | null) => set({ error }, false, SignInActionTypes.SET_ERROR),

  reset: () => set(signInInitialState, false, SignInActionTypes.RESET),
});
