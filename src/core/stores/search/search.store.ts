import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { SEARCH_PERSIST_KEY } from '../persistedKeys';
import { createSearchActions } from './search.actions';
import { searchInitialState, SearchStore } from './search.types';

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
        // Persist all recent searches (active tags stay URL-derived)
        partialize: (state) => ({
          recentUsers: state.recentUsers,
          recentTags: state.recentTags,
          recentQueries: state.recentQueries,
        }),
      },
    ),
    {
      name: 'search-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
