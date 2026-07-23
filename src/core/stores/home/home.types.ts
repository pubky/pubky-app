// Home constants
export const LAYOUT = {
  COLUMNS: 'columns',
  WIDE: 'wide',
  LIST: 'list',
  VISUAL: 'visual',
} as const;

export const SORT = {
  TIMELINE: 'timeline',
  ENGAGEMENT: 'total_engagement',
} as const;

// ME and NETWORK are UI-level reaches:
// - ME resolves to the signed-in user's existing author/profile stream.
// - NETWORK currently resolves to the same public stream as ALL.
export const REACH = {
  ME: 'me',
  FRIENDS: 'friends',
  FOLLOWING: 'following',
  NETWORK: 'network',
  ALL: 'all',
} as const;

export const PROFILE_TAG_SCOPE = {
  NETWORK: 'network',
  FOLLOWING: 'following',
  ME: 'me',
} as const;

export const HOME_NETWORK_REACH_MIN_FOLLOWING = 3;

// Nexus domain_tags API limit.
export const HOME_PROFILE_TAGS_MAX_SELECTED = 5;

export enum CONTENT {
  ALL = 'all',
  SHORT = 'short',
  LONG = 'long',
  COLLECTIONS = 'collections',
  IMAGES = 'images',
  VIDEOS = 'videos',
  LINKS = 'links',
  FILES = 'files',
}

// Home types
export type LayoutType = (typeof LAYOUT)[keyof typeof LAYOUT];
export type SortType = (typeof SORT)[keyof typeof SORT];
export type ReachType = (typeof REACH)[keyof typeof REACH];
export type ProfileTagScopeType = (typeof PROFILE_TAG_SCOPE)[keyof typeof PROFILE_TAG_SCOPE];
export type ContentType = (typeof CONTENT)[keyof typeof CONTENT];

export interface HomeState {
  layout: LayoutType;
  sort: SortType;
  reach: ReachType;
  content: ContentType;
  profileTags: string[];
  profileTagScope: ProfileTagScopeType;
}

export interface HomeActions {
  setLayout: (layout: LayoutType) => void;
  setSort: (sort: SortType) => void;
  setReach: (reach: ReachType) => void;
  setContent: (content: ContentType) => void;
  setProfileTags: (profileTags: string[]) => void;
  addProfileTag: (profileTag: string) => void;
  removeProfileTag: (profileTag: string) => void;
  clearProfileTags: () => void;
  setProfileTagScope: (profileTagScope: ProfileTagScopeType) => void;
  reset: () => void;
}

export type HomeStore = HomeState & HomeActions;

// Initial state
export const homeInitialState: HomeState = {
  layout: LAYOUT.COLUMNS,
  sort: SORT.TIMELINE,
  reach: REACH.ALL,
  content: CONTENT.ALL,
  profileTags: [],
  profileTagScope: PROFILE_TAG_SCOPE.NETWORK,
};

// Action types for DevTools
export enum HomeActionTypes {
  SET_HOME_LAYOUT = 'SET_HOME_LAYOUT',
  SET_HOME_SORT = 'SET_HOME_SORT',
  SET_HOME_REACH = 'SET_HOME_REACH',
  SET_HOME_CONTENT = 'SET_HOME_CONTENT',
  SET_HOME_PROFILE_TAGS = 'SET_HOME_PROFILE_TAGS',
  ADD_HOME_PROFILE_TAG = 'ADD_HOME_PROFILE_TAG',
  REMOVE_HOME_PROFILE_TAG = 'REMOVE_HOME_PROFILE_TAG',
  CLEAR_HOME_PROFILE_TAGS = 'CLEAR_HOME_PROFILE_TAGS',
  SET_HOME_PROFILE_TAG_SCOPE = 'SET_HOME_PROFILE_TAG_SCOPE',
  RESET_HOME = 'RESET_HOME',
}
