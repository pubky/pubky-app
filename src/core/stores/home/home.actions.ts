import { ZustandSet } from '../stores.types';
import {
  HOME_PROFILE_TAGS_MAX_SELECTED,
  HomeActions,
  HomeActionTypes,
  homeInitialState,
  HomeStore,
  REACH,
  type ReachType,
} from './home.types';

function normalizeProfileTag(profileTag: string): string {
  return profileTag.trim().toLowerCase();
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

function shouldClearProfileTagsForReach(reach: ReachType): boolean {
  return reach === REACH.ALL || reach === REACH.ME;
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
      { reach, ...(shouldClearProfileTagsForReach(reach) ? { profileTags: [] } : {}) },
      false,
      HomeActionTypes.SET_HOME_REACH,
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
          state.profileTags.some((tag) => tag.toLowerCase() === normalizedTag)
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
        return { profileTags: state.profileTags.filter((tag) => tag.toLowerCase() !== normalizedTag) };
      },
      false,
      HomeActionTypes.REMOVE_HOME_PROFILE_TAG,
    );
  },

  clearProfileTags: () => {
    set({ profileTags: [] }, false, HomeActionTypes.CLEAR_HOME_PROFILE_TAGS);
  },

  reset: () => {
    set(homeInitialState, false, HomeActionTypes.RESET_HOME);
  },
});
