import { beforeEach, describe, expect, it } from 'vitest';
import { useHomeStore } from './home.store';
import { CONTENT, HOME_PROFILE_TAGS_MAX_SELECTED, homeInitialState, LAYOUT, REACH, SORT } from './home.types';

describe('HomeStore', () => {
  beforeEach(() => {
    // Reset the store to initial state before each test
    useHomeStore.getState().reset();
  });

  describe('Initial State', () => {
    it('should initialize with default filter values', () => {
      const state = useHomeStore.getState();

      expect(state.layout).toBe(LAYOUT.COLUMNS);
      expect(state.sort).toBe(SORT.TIMELINE);
      expect(state.reach).toBe(REACH.ALL);
      expect(state.content).toBe(CONTENT.ALL);
      expect(state.profileTags).toEqual([]);
      expect(state.taggedAsActive).toBe(false);
      expect(state.hasUserSetReach).toBe(false);
    });

    it('should match homeInitialState', () => {
      const state = useHomeStore.getState();

      expect(state.layout).toBe(homeInitialState.layout);
      expect(state.sort).toBe(homeInitialState.sort);
      expect(state.reach).toBe(homeInitialState.reach);
      expect(state.content).toBe(homeInitialState.content);
      expect(state.profileTags).toEqual(homeInitialState.profileTags);
      expect(state.taggedAsActive).toBe(homeInitialState.taggedAsActive);
      expect(state.hasUserSetReach).toBe(homeInitialState.hasUserSetReach);
    });
  });

  describe('Persistence Hydration', () => {
    it('marks the store as hydrated when persisted storage cannot be read', async () => {
      const originalStorage = useHomeStore.persist.getOptions().storage;
      const failingStorage: NonNullable<typeof originalStorage> = {
        getItem: async () => {
          throw new Error('storage unavailable');
        },
        setItem: async () => undefined,
        removeItem: async () => undefined,
      };

      useHomeStore.getState().setHasHydrated(false);
      useHomeStore.persist.setOptions({ storage: failingStorage });

      try {
        await useHomeStore.persist.rehydrate();
        expect(useHomeStore.getState().hasHydrated).toBe(true);
      } finally {
        useHomeStore.persist.setOptions({ storage: originalStorage });
      }
    });
  });

  describe('Layout Management', () => {
    it('should set layout to columns', () => {
      const store = useHomeStore.getState();

      store.setLayout(LAYOUT.COLUMNS);
      expect(useHomeStore.getState().layout).toBe(LAYOUT.COLUMNS);
    });

    it('should set layout to wide', () => {
      const store = useHomeStore.getState();

      store.setLayout(LAYOUT.WIDE);
      expect(useHomeStore.getState().layout).toBe(LAYOUT.WIDE);
    });

    it('should set layout to visual', () => {
      const store = useHomeStore.getState();

      store.setLayout(LAYOUT.VISUAL);
      expect(useHomeStore.getState().layout).toBe(LAYOUT.VISUAL);
    });

    it('should persist layout changes', () => {
      const store = useHomeStore.getState();

      store.setLayout(LAYOUT.WIDE);
      expect(useHomeStore.getState().layout).toBe(LAYOUT.WIDE);

      store.setLayout(LAYOUT.VISUAL);
      expect(useHomeStore.getState().layout).toBe(LAYOUT.VISUAL);
    });
  });

  describe('Sort Management', () => {
    it('should set sort to recent', () => {
      const store = useHomeStore.getState();

      store.setSort(SORT.TIMELINE);
      expect(useHomeStore.getState().sort).toBe(SORT.TIMELINE);
    });

    it('should set sort to popularity', () => {
      const store = useHomeStore.getState();

      store.setSort(SORT.ENGAGEMENT);
      expect(useHomeStore.getState().sort).toBe(SORT.ENGAGEMENT);
    });

    it('should toggle between sort options', () => {
      const store = useHomeStore.getState();

      store.setSort(SORT.ENGAGEMENT);
      expect(useHomeStore.getState().sort).toBe(SORT.ENGAGEMENT);

      store.setSort(SORT.TIMELINE);
      expect(useHomeStore.getState().sort).toBe(SORT.TIMELINE);
    });
  });

  describe('Reach Management', () => {
    it('should set reach to all', () => {
      const store = useHomeStore.getState();

      store.setReach(REACH.ALL);
      expect(useHomeStore.getState().reach).toBe(REACH.ALL);
    });

    it('should set reach to following', () => {
      const store = useHomeStore.getState();

      store.setReach(REACH.FOLLOWING);
      expect(useHomeStore.getState().reach).toBe(REACH.FOLLOWING);
    });

    it('should set reach to network', () => {
      const store = useHomeStore.getState();

      store.setReach(REACH.NETWORK);
      expect(useHomeStore.getState().reach).toBe(REACH.NETWORK);
    });

    it('should set reach to friends', () => {
      const store = useHomeStore.getState();

      store.setReach(REACH.FRIENDS);
      expect(useHomeStore.getState().reach).toBe(REACH.FRIENDS);
    });

    it('should set reach to me', () => {
      const store = useHomeStore.getState();

      store.setReach(REACH.ME);
      expect(useHomeStore.getState().reach).toBe(REACH.ME);
    });

    it('should change reach multiple times', () => {
      const store = useHomeStore.getState();

      store.setReach(REACH.FOLLOWING);
      expect(useHomeStore.getState().reach).toBe(REACH.FOLLOWING);

      store.setReach(REACH.FRIENDS);
      expect(useHomeStore.getState().reach).toBe(REACH.FRIENDS);

      store.setReach(REACH.ALL);
      expect(useHomeStore.getState().reach).toBe(REACH.ALL);
    });

    it('should park profile tags when reach changes', () => {
      const store = useHomeStore.getState();

      store.addProfileTag('bitcoin');
      store.addProfileTag('dev');
      store.setTaggedAsActive(true);

      expect(useHomeStore.getState().profileTags).toEqual(['bitcoin', 'dev']);

      store.setReach(REACH.ALL);

      expect(useHomeStore.getState().reach).toBe(REACH.ALL);
      expect(useHomeStore.getState().taggedAsActive).toBe(false);
      expect(useHomeStore.getState().profileTags).toEqual(['bitcoin', 'dev']);
    });

    it('should activate Tagged as without changing the base reach', () => {
      const store = useHomeStore.getState();

      store.setReach(REACH.ME);
      store.setTaggedAsActive(true);

      expect(useHomeStore.getState().reach).toBe(REACH.ME);
      expect(useHomeStore.getState().taggedAsActive).toBe(true);
      expect(useHomeStore.getState().hasUserSetReach).toBe(true);
    });

    it('should apply the fresh-user default only while no user reach choice exists', () => {
      const store = useHomeStore.getState();

      store.applyDefaultReach(REACH.NETWORK);

      expect(useHomeStore.getState().reach).toBe(REACH.NETWORK);
      expect(useHomeStore.getState().hasUserSetReach).toBe(false);

      store.reset();
      store.setReach(REACH.FRIENDS);
      store.applyDefaultReach(REACH.NETWORK);

      expect(useHomeStore.getState().reach).toBe(REACH.FRIENDS);
    });

    it('should not apply the fresh-user default after Tagged as was selected', () => {
      const store = useHomeStore.getState();

      store.setTaggedAsActive(true);
      store.applyDefaultReach(REACH.NETWORK);

      expect(useHomeStore.getState().reach).toBe(REACH.ALL);
      expect(useHomeStore.getState().taggedAsActive).toBe(true);
    });
  });

  describe('Profile Tag Management', () => {
    it('should set normalized unique profile tags up to the max', () => {
      const store = useHomeStore.getState();

      store.setProfileTags(['Bitcoin', 'bitcoin', 'Nostr', 'Dev', 'Design', 'Lightning', 'Extra']);

      expect(useHomeStore.getState().profileTags).toEqual(['bitcoin', 'nostr', 'dev', 'design', 'lightning']);
      expect(useHomeStore.getState().profileTags).toHaveLength(HOME_PROFILE_TAGS_MAX_SELECTED);
    });

    it('should strip Nexus-invalid tag label characters and preserve emoji', () => {
      const store = useHomeStore.getState();

      store.setProfileTags(['Bit:coin', 'dev,tag', 'light ning', '🔥']);

      expect(useHomeStore.getState().profileTags).toEqual(['bitcoin', 'devtag', 'lightning', '🔥']);
    });

    it('should add a normalized profile tag', () => {
      const store = useHomeStore.getState();

      store.addProfileTag('Bitcoin');

      expect(useHomeStore.getState().profileTags).toEqual(['bitcoin']);
    });

    it('should strip Nexus-invalid characters when adding a profile tag', () => {
      const store = useHomeStore.getState();

      store.addProfileTag('Bit:coin,🔥');

      expect(useHomeStore.getState().profileTags).toEqual(['bitcoin🔥']);
    });

    it('should prevent duplicate profile tags', () => {
      const store = useHomeStore.getState();

      store.addProfileTag('Bitcoin');
      store.addProfileTag('bitcoin');

      expect(useHomeStore.getState().profileTags).toEqual(['bitcoin']);
    });

    it('should prevent adding more than five profile tags', () => {
      const store = useHomeStore.getState();

      ['one', 'two', 'three', 'four', 'five', 'six'].forEach((tag) => store.addProfileTag(tag));

      expect(useHomeStore.getState().profileTags).toEqual(['one', 'two', 'three', 'four', 'five']);
    });

    it('should remove a profile tag case-insensitively', () => {
      const store = useHomeStore.getState();

      store.setProfileTags(['bitcoin', 'nostr']);
      store.removeProfileTag('BITCOIN');

      expect(useHomeStore.getState().profileTags).toEqual(['nostr']);
    });

    it('should clear profile tags', () => {
      const store = useHomeStore.getState();

      store.setProfileTags(['bitcoin', 'nostr']);
      store.clearProfileTags();

      expect(useHomeStore.getState().profileTags).toEqual([]);
    });
  });

  describe('Content Management', () => {
    it('should set content to all', () => {
      const store = useHomeStore.getState();

      store.setContent(CONTENT.ALL);
      expect(useHomeStore.getState().content).toBe(CONTENT.ALL);
    });

    it('should set content to posts', () => {
      const store = useHomeStore.getState();

      store.setContent(CONTENT.SHORT);
      expect(useHomeStore.getState().content).toBe(CONTENT.SHORT);
    });

    it('should set content to articles', () => {
      const store = useHomeStore.getState();

      store.setContent(CONTENT.LONG);
      expect(useHomeStore.getState().content).toBe(CONTENT.LONG);
    });

    it('should set content to images', () => {
      const store = useHomeStore.getState();

      store.setContent(CONTENT.IMAGES);
      expect(useHomeStore.getState().content).toBe(CONTENT.IMAGES);
    });

    it('should set content to videos', () => {
      const store = useHomeStore.getState();

      store.setContent(CONTENT.VIDEOS);
      expect(useHomeStore.getState().content).toBe(CONTENT.VIDEOS);
    });

    it('should set content to links', () => {
      const store = useHomeStore.getState();

      store.setContent(CONTENT.LINKS);
      expect(useHomeStore.getState().content).toBe(CONTENT.LINKS);
    });

    it('should set content to files', () => {
      const store = useHomeStore.getState();

      store.setContent(CONTENT.FILES);
      expect(useHomeStore.getState().content).toBe(CONTENT.FILES);
    });

    it('should change content filter multiple times', () => {
      const store = useHomeStore.getState();

      store.setContent(CONTENT.SHORT);
      expect(useHomeStore.getState().content).toBe(CONTENT.SHORT);

      store.setContent(CONTENT.IMAGES);
      expect(useHomeStore.getState().content).toBe(CONTENT.IMAGES);

      store.setContent(CONTENT.ALL);
      expect(useHomeStore.getState().content).toBe(CONTENT.ALL);
    });
  });

  describe('Multiple Filter Changes', () => {
    it('should handle multiple filter changes independently', () => {
      const store = useHomeStore.getState();

      store.setLayout(LAYOUT.WIDE);
      store.setSort(SORT.ENGAGEMENT);
      store.setReach(REACH.FOLLOWING);
      store.setContent(CONTENT.IMAGES);

      const state = useHomeStore.getState();
      expect(state.layout).toBe(LAYOUT.WIDE);
      expect(state.sort).toBe(SORT.ENGAGEMENT);
      expect(state.reach).toBe(REACH.FOLLOWING);
      expect(state.content).toBe(CONTENT.IMAGES);
    });

    it('should maintain other filters when one is changed', () => {
      const store = useHomeStore.getState();

      // Set initial filters
      store.setLayout(LAYOUT.WIDE);
      store.setSort(SORT.ENGAGEMENT);
      store.setReach(REACH.FOLLOWING);
      store.setContent(CONTENT.IMAGES);

      // Change only one filter
      store.setSort(SORT.TIMELINE);

      // Other filters should remain unchanged
      const state = useHomeStore.getState();
      expect(state.layout).toBe(LAYOUT.WIDE);
      expect(state.sort).toBe(SORT.TIMELINE);
      expect(state.reach).toBe(REACH.FOLLOWING);
      expect(state.content).toBe(CONTENT.IMAGES);
    });
  });

  describe('Reset Functionality', () => {
    it('should preserve hydration while resetting persisted filters', () => {
      const store = useHomeStore.getState();
      store.setHasHydrated(true);
      store.setReach(REACH.FRIENDS);

      store.reset();

      expect(useHomeStore.getState().hasHydrated).toBe(true);
      expect(useHomeStore.getState().reach).toBe(REACH.ALL);
      expect(useHomeStore.getState().hasUserSetReach).toBe(false);
    });

    it('should reset all filters to initial state', () => {
      const store = useHomeStore.getState();

      // Set all filters to non-default values
      store.setLayout(LAYOUT.WIDE);
      store.setSort(SORT.ENGAGEMENT);
      store.setReach(REACH.FOLLOWING);
      store.setContent(CONTENT.IMAGES);

      // Verify state is set
      expect(useHomeStore.getState().layout).toBe(LAYOUT.WIDE);
      expect(useHomeStore.getState().sort).toBe(SORT.ENGAGEMENT);
      expect(useHomeStore.getState().reach).toBe(REACH.FOLLOWING);
      expect(useHomeStore.getState().content).toBe(CONTENT.IMAGES);

      // Reset store
      store.reset();

      // Verify state is reset to initial values
      const state = useHomeStore.getState();
      expect(state.layout).toBe(LAYOUT.COLUMNS);
      expect(state.sort).toBe(SORT.TIMELINE);
      expect(state.reach).toBe(REACH.ALL);
      expect(state.content).toBe(CONTENT.ALL);
    });

    it('should reset partial changes', () => {
      const store = useHomeStore.getState();

      // Change only some filters
      store.setLayout(LAYOUT.VISUAL);
      store.setReach(REACH.FRIENDS);

      // Reset
      store.reset();

      // All should be back to initial state
      const state = useHomeStore.getState();
      expect(state.layout).toBe(LAYOUT.COLUMNS);
      expect(state.sort).toBe(SORT.TIMELINE);
      expect(state.reach).toBe(REACH.ALL);
      expect(state.content).toBe(CONTENT.ALL);
    });

    it('should be idempotent - multiple resets should have same result', () => {
      const store = useHomeStore.getState();

      // Set some state
      store.setLayout(LAYOUT.WIDE);
      store.setSort(SORT.ENGAGEMENT);

      // Reset multiple times
      store.reset();
      store.reset();
      store.reset();

      // Should still be at initial state
      const state = useHomeStore.getState();
      expect(state.layout).toBe(LAYOUT.COLUMNS);
      expect(state.sort).toBe(SORT.TIMELINE);
      expect(state.reach).toBe(REACH.ALL);
      expect(state.content).toBe(CONTENT.ALL);
    });
  });

  describe('State Isolation', () => {
    it('should not affect other state properties when updating one', () => {
      const store = useHomeStore.getState();

      // Get initial state
      const initialState = useHomeStore.getState();

      // Change layout
      store.setLayout(LAYOUT.WIDE);

      // Other properties should remain the same
      expect(useHomeStore.getState().sort).toBe(initialState.sort);
      expect(useHomeStore.getState().reach).toBe(initialState.reach);
      expect(useHomeStore.getState().content).toBe(initialState.content);
    });
  });

  describe('Type Safety', () => {
    it('should accept valid layout values', () => {
      const store = useHomeStore.getState();

      // These should all work without type errors
      store.setLayout(LAYOUT.COLUMNS);
      store.setLayout(LAYOUT.WIDE);
      store.setLayout(LAYOUT.VISUAL);

      expect(useHomeStore.getState().layout).toBe(LAYOUT.VISUAL);
    });

    it('should accept valid sort values', () => {
      const store = useHomeStore.getState();

      store.setSort(SORT.TIMELINE);
      store.setSort(SORT.ENGAGEMENT);

      expect(useHomeStore.getState().sort).toBe(SORT.ENGAGEMENT);
    });

    it('should accept valid reach values', () => {
      const store = useHomeStore.getState();

      store.setReach(REACH.ALL);
      store.setReach(REACH.FOLLOWING);
      store.setReach(REACH.FRIENDS);

      expect(useHomeStore.getState().reach).toBe(REACH.FRIENDS);
    });

    it('should accept valid content values', () => {
      const store = useHomeStore.getState();

      store.setContent(CONTENT.ALL);
      store.setContent(CONTENT.SHORT);
      store.setContent(CONTENT.LONG);
      store.setContent(CONTENT.IMAGES);
      store.setContent(CONTENT.VIDEOS);
      store.setContent(CONTENT.LINKS);
      store.setContent(CONTENT.FILES);

      expect(useHomeStore.getState().content).toBe(CONTENT.FILES);
    });
  });
});
