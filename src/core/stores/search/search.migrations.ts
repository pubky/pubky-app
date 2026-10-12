import { toContentSearchKey } from '@/libs/search/contentSearch';
import type { RecentQuerySearch, SearchState } from './search.types';

export const SEARCH_STORE_VERSION = 1;

type PersistedSearchState = Pick<SearchState, 'recentUsers' | 'recentTags' | 'recentQueries'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecentQuery(value: unknown): value is RecentQuerySearch {
  return isRecord(value) && typeof value.query === 'string' && typeof value.searchedAt === 'number';
}

/**
 * Version 0 deduped recent queries by exact text, so case variants ("Bitcoin",
 * "bitcoin") could both be stored although they are one search. Keep only the
 * first of each (the list is newest-first) and drop malformed entries.
 */
export function migrateSearchPersistedState(persistedState: unknown, version: number): PersistedSearchState {
  const state = isRecord(persistedState) ? persistedState : {};

  if (version >= SEARCH_STORE_VERSION) {
    return state as PersistedSearchState;
  }

  const persistedQueries = Array.isArray(state.recentQueries) ? state.recentQueries.filter(isRecentQuery) : [];
  const seenKeys = new Set<string>();
  const recentQueries = persistedQueries.filter((recentQuery) => {
    const key = toContentSearchKey(recentQuery.query);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  return { ...(state as Partial<PersistedSearchState>), recentQueries } as PersistedSearchState;
}
