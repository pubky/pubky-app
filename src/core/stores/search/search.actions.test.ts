import { beforeEach, describe, expect, it } from 'vitest';
import { getMaxStreamTags } from '@/libs/runtime-config/runtime-config';
import { MAX_RECENT_SEARCHES } from './search.constants';
import { useSearchStore } from './search.store';

describe('SearchStore', () => {
  beforeEach(() => {
    // Reset the store to initial state before each test
    useSearchStore.getState().reset();
  });

  describe('addQuery', () => {
    it('should add a query to the top of recent queries', () => {
      const store = useSearchStore.getState();

      store.addQuery('bitcoin');
      store.addQuery('nostr');

      expect(useSearchStore.getState().recentQueries.map((q) => q.query)).toEqual(['nostr', 'bitcoin']);
    });

    it('should move an existing query to the top instead of duplicating it', () => {
      const store = useSearchStore.getState();

      store.addQuery('bitcoin');
      store.addQuery('nostr');
      store.addQuery('bitcoin');

      expect(useSearchStore.getState().recentQueries.map((q) => q.query)).toEqual(['bitcoin', 'nostr']);
    });

    it('should cap recent queries at MAX_RECENT_SEARCHES, dropping the oldest', () => {
      const store = useSearchStore.getState();

      for (let i = 1; i <= MAX_RECENT_SEARCHES + 1; i++) {
        store.addQuery(`query${i}`);
      }

      const queries = useSearchStore.getState().recentQueries.map((q) => q.query);
      expect(queries).toHaveLength(MAX_RECENT_SEARCHES);
      expect(queries).toEqual(['query6', 'query5', 'query4', 'query3', 'query2']);
    });
  });

  describe('active tags', () => {
    // Tags the search URL can carry: the chip cap must match it, or a chip
    // edit rebuilds the URL without the tags that had no chip (#2446).
    const urlTags = Array.from({ length: getMaxStreamTags() }, (_, i) => `tag${i + 1}`);

    it('keeps every tag the search URL carries as a chip', () => {
      useSearchStore.getState().setActiveTags(urlTags);

      expect(useSearchStore.getState().activeTags).toEqual(urlTags);
    });

    it('caps active tags at the stream tag limit', () => {
      useSearchStore.getState().setActiveTags([...urlTags, 'extra']);

      expect(useSearchStore.getState().activeTags).toEqual(urlTags);
    });

    it('drops the oldest active tag when adding past the stream tag limit', () => {
      const store = useSearchStore.getState();
      store.setActiveTags(urlTags);

      store.addActiveTag('extra');

      expect(useSearchStore.getState().activeTags).toEqual([...urlTags.slice(1), 'extra']);
    });
  });

  describe('clearRecentSearches', () => {
    it('should clear recent users, tags, and queries but keep active tags', () => {
      const store = useSearchStore.getState();

      store.addUser('user-pubky');
      store.addTag('bitcoin');
      store.addQuery('privacy tools');
      store.setActiveTags(['pubky']);

      store.clearRecentSearches();

      const state = useSearchStore.getState();
      expect(state.recentUsers).toEqual([]);
      expect(state.recentTags).toEqual([]);
      expect(state.recentQueries).toEqual([]);
      expect(state.activeTags).toEqual(['pubky']);
    });
  });
});
