import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { HotStore, hotInitialState } from './hot.types';
import { createHotActions } from './hot.actions';
import { HOT_PERSIST_KEY } from '../persistedKeys';

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
