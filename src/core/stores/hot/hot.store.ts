import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { HOT_PERSIST_KEY } from '../persistedKeys';
import { createHotActions } from './hot.actions';
import { hotInitialState, HotStore } from './hot.types';

// Store creation
export const useHotStore = create<HotStore>()(
  devtools(
    persist(
      (set) => ({
        ...hotInitialState,
        ...createHotActions(set),
      }),
      {
        name: HOT_PERSIST_KEY,
        // Persist all hot states
        partialize: (state) => ({
          reach: state.reach,
          timeframe: state.timeframe,
        }),
      },
    ),
    {
      name: 'hot-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
