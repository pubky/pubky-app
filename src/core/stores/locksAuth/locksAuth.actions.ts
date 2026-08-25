import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { ZustandSet } from '../stores.types';
import {
  LocksAuthActions,
  LocksAuthActionTypes,
  locksAuthInitialState,
  LocksAuthInitParams,
  LocksAuthStore,
} from './locksAuth.types';

export const createLocksAuthActions = (set: ZustandSet<LocksAuthStore>): LocksAuthActions => ({
  init: ({ session, secret }: LocksAuthInitParams) => {
    set({ session, locksSessionSecret: secret, paykitConnected: false }, false, LocksAuthActionTypes.INIT);
  },
  reset: () => {
    set((state) => ({ ...locksAuthInitialState, hasHydrated: state.hasHydrated }), false, LocksAuthActionTypes.RESET);
  },
  setSession: (session: LocksSdkSession | null) => {
    set({ session }, false, LocksAuthActionTypes.SET_SESSION);
  },
  setPaykitConnected: (connected: boolean) => {
    set({ paykitConnected: connected }, false, LocksAuthActionTypes.SET_PAYKIT_CONNECTED);
  },
  setHasHydrated: (hasHydrated: boolean) => {
    set({ hasHydrated }, false, LocksAuthActionTypes.SET_HAS_HYDRATED);
  },
});
