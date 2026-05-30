import type { Pubky } from '@/models/models.types';
import { ZustandSet } from '../stores.types';
import { MAX_ACTIVE_SEARCH_TAGS, MAX_RECENT_SEARCHES } from './search.constants';
import {
  RecentTagSearch,
  RecentUserSearch,
  SearchActions,
  SearchActionTypes,
  searchInitialState,
  SearchStore,
} from './search.types';
import { addItemToTop, addTagToArray } from './search.utils';

/**
 * Actions/Mutators - State modification functions
 */
export const createSearchActions = (set: ZustandSet<SearchStore>): SearchActions => ({
  /**
   * Add a user to recent searches
   * Moves existing user to top if already present
   * Removes oldest if at max capacity
   */
  addUser: (userId: Pubky) => {
    set(
      (state) => {
        const now = Date.now();
        const newUser: RecentUserSearch = { id: userId, searchedAt: now };
        const newUsers = addItemToTop(state.recentUsers, newUser, (user) => user.id === userId, MAX_RECENT_SEARCHES);
        return { recentUsers: newUsers };
      },
      false,
      SearchActionTypes.ADD_USER,
    );
  },

  /**
   * Add a tag to recent searches
   * Moves existing tag to top if already present
   * Removes oldest if at max capacity
   * Note: Tag should be normalized (lowercase, trimmed) before calling
   */
  addTag: (tag: string) => {
    set(
      (state) => {
        const now = Date.now();
        const newTag: RecentTagSearch = { tag, searchedAt: now };
        const newTags = addItemToTop(state.recentTags, newTag, (t) => t.tag === tag, MAX_RECENT_SEARCHES);
        return { recentTags: newTags };
      },
      false,
      SearchActionTypes.ADD_TAG,
    );
  },

  /**
   * Clear only recent searches (users and tags), keep active tags
   */
  clearRecentSearches: () => {
    set(
      (_state) => ({
        recentUsers: [],
        recentTags: [],
      }),
      false,
      SearchActionTypes.CLEAR_RECENT_SEARCHES,
    );
  },

  /**
   * Set active tags (used for URL → store sync)
   * Replaces all active tags with the provided array
   * Note: Tags should be normalized (lowercase, trimmed) before calling
   */
  setActiveTags: (tags: string[]) => {
    set(
      () => ({
        activeTags: tags.slice(0, MAX_ACTIVE_SEARCH_TAGS),
      }),
      false,
      SearchActionTypes.SET_ACTIVE_TAGS,
    );
  },

  /**
   * Add a tag to active tags (optimistic update)
   * Moves existing tag to end if already present
   * Removes oldest tag if at max capacity
   * Note: Tag should be normalized (lowercase, trimmed) before calling
   */
  addActiveTag: (tag: string) => {
    set(
      (state) => {
        const newTags = addTagToArray(state.activeTags, tag);
        return { activeTags: newTags };
      },
      false,
      SearchActionTypes.ADD_ACTIVE_TAG,
    );
  },

  /**
   * Remove a tag from active tags (optimistic update)
   * Note: Tag should be normalized (lowercase, trimmed) before calling
   */
  removeActiveTag: (tag: string) => {
    set(
      (state) => ({
        activeTags: state.activeTags.filter((t) => t !== tag),
      }),
      false,
      SearchActionTypes.REMOVE_ACTIVE_TAG,
    );
  },

  reset: () => {
    set(searchInitialState, false, SearchActionTypes.RESET);
  },
});
