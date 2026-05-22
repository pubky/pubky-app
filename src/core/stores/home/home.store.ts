import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { HOME_PERSIST_KEY } from '../persistedKeys';
import { createHomeActions } from './home.actions';
import { homeInitialState, HomeStore } from './home.types';

// Store creation
export const useHomeStore = create<HomeStore>()(
  devtools(
    persist(
      (set) => ({
        ...homeInitialState,
        ...createHomeActions(set),
      }),
      {
        name: HOME_PERSIST_KEY,
        // Persist all home states
        partialize: (state) => ({
          layout: state.layout,
          sort: state.sort,
          reach: state.reach,
          content: state.content,
        }),
      },
    ),
    {
      name: 'home-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
