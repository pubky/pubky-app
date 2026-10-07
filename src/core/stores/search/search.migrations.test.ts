import { describe, expect, it } from 'vitest';
import type { Pubky } from '@/models/models.types';
import { migrateSearchPersistedState, SEARCH_STORE_VERSION } from './search.migrations';

describe('migrateSearchPersistedState', () => {
  it('collapses case-variant recent queries into the newest one and keeps users and tags', () => {
    const recentUsers = [{ id: 'user-1' as Pubky, searchedAt: 5 }];
    const recentTags = [{ tag: 'pubky', searchedAt: 4 }];

    const migrated = migrateSearchPersistedState(
      {
        recentUsers,
        recentTags,
        recentQueries: [
          { query: 'Bitcoin', searchedAt: 3 },
          { query: 'nostr', searchedAt: 2 },
          { query: 'BITCOIN', searchedAt: 1 },
          { query: 'bitcoin', searchedAt: 0 },
        ],
      },
      0,
    );

    expect(migrated).toEqual({
      recentUsers,
      recentTags,
      recentQueries: [
        { query: 'Bitcoin', searchedAt: 3 },
        { query: 'nostr', searchedAt: 2 },
      ],
    });
  });

  it('drops malformed recent queries and tolerates a missing or malformed state', () => {
    expect(
      migrateSearchPersistedState({ recentQueries: [{ query: 'nostr', searchedAt: 1 }, { query: 42 }, null] }, 0),
    ).toEqual({ recentQueries: [{ query: 'nostr', searchedAt: 1 }] });
    expect(migrateSearchPersistedState({ recentQueries: 'bitcoin' }, 0)).toEqual({ recentQueries: [] });
    expect(migrateSearchPersistedState(null, 0)).toEqual({ recentQueries: [] });
  });

  it('does not reinterpret data already stored at the current version', () => {
    const state = {
      recentQueries: [
        { query: 'Bitcoin', searchedAt: 1 },
        { query: 'bitcoin', searchedAt: 0 },
      ],
    };

    expect(migrateSearchPersistedState(state, SEARCH_STORE_VERSION)).toBe(state);
  });
});
