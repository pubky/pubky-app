import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { SearchStore, searchInitialState } from './search.types';
import { createSearchActions } from './search.actions';
import { SEARCH_PERSIST_KEY } from '../persistedKeys';

/**
 * Search Store
 *
 * Manages recent searches (users and tags) with persistence to localStorage.
 * Recent searches are limited to MAX_RECENT_SEARCHES per type.
 */
export const useSearchStore = create<SearchStore>()(
  devtools(
    persist(
      (set) => ({
        ...searchInitialState,
        ...createSearchActions(set),
      }),
      {
        name: SEARCH_PERSIST_KEY,
        // Persist all search state
        partialize: (state) => ({
          recentUsers: state.recentUsers,
          recentTags: state.recentTags,
        }),
      },
    ),
    {
      name: 'search-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
