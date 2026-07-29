import { sanitizeTagInput } from '@/libs/utils/utils';
import { ZustandSet } from '../stores.types';
import {
  HOME_PROFILE_TAGS_MAX_SELECTED,
  HomeActions,
  HomeActionTypes,
  homeInitialState,
  HomeStore,
  REACH,
} from './home.types';

function normalizeProfileTag(profileTag: string): string {
  return sanitizeTagInput(profileTag.trim()).toLowerCase();
}

function normalizeProfileTags(profileTags: string[]): string[] {
  const normalizedTags = new Set<string>();

  for (const profileTag of profileTags) {
    const normalizedTag = normalizeProfileTag(profileTag);
    if (normalizedTag) {
      normalizedTags.add(normalizedTag);
    }
    if (normalizedTags.size >= HOME_PROFILE_TAGS_MAX_SELECTED) {
      break;
    }
  }

  return Array.from(normalizedTags);
}

// Actions/Mutators - State modification functions
export const createHomeActions = (set: ZustandSet<HomeStore>): HomeActions => ({
  setLayout: (layout) => {
    set({ layout }, false, HomeActionTypes.SET_HOME_LAYOUT);
  },

  setSort: (sort) => {
    set({ sort }, false, HomeActionTypes.SET_HOME_SORT);
  },

  setReach: (reach) => {
    set(
      {
        reach,
        taggedAsActive: false,
        hasUserSetReach: true,
      },
      false,
      HomeActionTypes.SET_HOME_REACH,
    );
  },

  setTaggedAsActive: (taggedAsActive) => {
    set(
      {
        taggedAsActive,
        hasUserSetReach: true,
      },
      false,
      HomeActionTypes.SET_HOME_TAGGED_AS_ACTIVE,
    );
  },

  applyDefaultReach: (reach) => {
    set(
      (state) => {
        if (state.hasUserSetReach || state.taggedAsActive || state.reach !== REACH.ALL) {
          return state;
        }

        return { reach };
      },
      false,
      HomeActionTypes.APPLY_DEFAULT_HOME_REACH,
    );
  },

  setContent: (content) => {
    set({ content }, false, HomeActionTypes.SET_HOME_CONTENT);
  },

  setProfileTags: (profileTags) => {
    set({ profileTags: normalizeProfileTags(profileTags) }, false, HomeActionTypes.SET_HOME_PROFILE_TAGS);
  },

  addProfileTag: (profileTag) => {
    set(
      (state) => {
        const normalizedTag = normalizeProfileTag(profileTag);
        if (
          !normalizedTag ||
          state.profileTags.length >= HOME_PROFILE_TAGS_MAX_SELECTED ||
          state.profileTags.includes(normalizedTag)
        ) {
          return { profileTags: state.profileTags };
        }
        return { profileTags: [...state.profileTags, normalizedTag] };
      },
      false,
      HomeActionTypes.ADD_HOME_PROFILE_TAG,
    );
  },

  removeProfileTag: (profileTag) => {
    set(
      (state) => {
        const normalizedTag = normalizeProfileTag(profileTag);
        return { profileTags: state.profileTags.filter((tag) => tag !== normalizedTag) };
      },
      false,
      HomeActionTypes.REMOVE_HOME_PROFILE_TAG,
    );
  },

  clearProfileTags: () => {
    set({ profileTags: [] }, false, HomeActionTypes.CLEAR_HOME_PROFILE_TAGS);
  },

  setHasHydrated: (hasHydrated) => {
    set({ hasHydrated }, false, HomeActionTypes.SET_HOME_HAS_HYDRATED);
  },

  reset: () => {
    set(
      (state) => ({
        ...homeInitialState,
        hasHydrated: state.hasHydrated,
      }),
      false,
      HomeActionTypes.RESET_HOME,
    );
  },
});
