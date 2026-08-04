import { describe, expect, it } from 'vitest';
import { migrateHomePersistedState } from './home.migrations';
import { REACH } from './home.types';

describe('migrateHomePersistedState', () => {
  it('treats an existing persisted All reach as user-selected', () => {
    expect(migrateHomePersistedState({ reach: REACH.ALL, profileTags: [] }, 0)).toMatchObject({
      reach: REACH.ALL,
      profileTags: [],
      taggedAsActive: false,
      hasUserSetReach: true,
    });
  });

  it('activates Tagged as for the legacy Network plus profile-tags shape', () => {
    expect(migrateHomePersistedState({ reach: REACH.NETWORK, profileTags: ['bitcoin', 'developer'] }, 0)).toMatchObject(
      {
        reach: REACH.NETWORK,
        profileTags: ['bitcoin', 'developer'],
        taggedAsActive: true,
        hasUserSetReach: true,
      },
    );
  });

  it.each([REACH.FOLLOWING, REACH.FRIENDS, REACH.ME])(
    'parks legacy profile tags on %s without changing its reach',
    (reach) => {
      expect(migrateHomePersistedState({ reach, profileTags: ['bitcoin'] }, 0)).toMatchObject({
        reach,
        profileTags: ['bitcoin'],
        taggedAsActive: false,
        hasUserSetReach: true,
      });
    },
  );

  it('fills missing V1 fields and ignores malformed profile tags', () => {
    expect(migrateHomePersistedState({ reach: REACH.NETWORK, profileTags: ['bitcoin', 42] }, 0)).toMatchObject({
      reach: REACH.NETWORK,
      profileTags: ['bitcoin'],
      taggedAsActive: true,
      hasUserSetReach: true,
    });
  });

  it.each([null, 'invalid', [], { reach: 'unknown' }])(
    'does not treat malformed legacy state as an explicit Reach choice',
    (persistedState) => {
      const migrated = migrateHomePersistedState(persistedState, 0);

      expect(migrated).toMatchObject({
        profileTags: [],
        taggedAsActive: false,
        hasUserSetReach: false,
      });
      expect(migrated).not.toHaveProperty('reach');
    },
  );

  it('does not reinterpret data already stored at the current version', () => {
    const state = {
      reach: REACH.FRIENDS,
      profileTags: ['bitcoin'],
      taggedAsActive: true,
      hasUserSetReach: false,
    };

    expect(migrateHomePersistedState(state, 1)).toBe(state);
  });
});
