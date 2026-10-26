import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { ClientRegionActionTypes, clientRegionInitialState, type ClientRegionStore } from './clientRegion.types';

/**
 * The viewer's IP country as the Shop's region route reports it. Memory only: it describes where this
 * page load comes from, so it is read afresh on every load and never persisted.
 */
export const useClientRegionStore = create<ClientRegionStore>()(
  devtools(
    (set) => ({
      ...clientRegionInitialState,

      markLoading: () => {
        set({ status: 'loading' }, false, ClientRegionActionTypes.MARK_LOADING);
      },

      markReady: (country) => {
        set({ status: 'ready', country }, false, ClientRegionActionTypes.MARK_READY);
      },

      markFailed: () => {
        set({ status: 'failed', country: null }, false, ClientRegionActionTypes.MARK_FAILED);
      },
    }),
    {
      name: 'client-region-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
