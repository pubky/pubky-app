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

// The value of each variant have to be identical to postStreamApi function names
// Like this, the reach value will invoke the specific API endpoint
export const REACH = {
  ALL: 'all',
  NETWORK: 'network',
  FOLLOWING: 'following',
  FRIENDS: 'friends',
  ME: 'me',
} as const;

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
export type ContentType = (typeof CONTENT)[keyof typeof CONTENT];

export interface HomeState {
  layout: LayoutType;
  sort: SortType;
  reach: ReachType;
  content: ContentType;
  profileTags: string[];
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
  RESET_HOME = 'RESET_HOME',
}
