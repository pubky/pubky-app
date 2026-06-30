// Home constants
export const LAYOUT = {
  COLUMNS: 'columns',
  WIDE: 'wide',
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
  FOLLOWING: 'following',
  FRIENDS: 'friends',
  //ME: 'me',
} as const;

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
}

export interface HomeActions {
  setLayout: (layout: LayoutType) => void;
  setSort: (sort: SortType) => void;
  setReach: (reach: ReachType) => void;
  setContent: (content: ContentType) => void;
  reset: () => void;
}

export type HomeStore = HomeState & HomeActions;

// Initial state
export const homeInitialState: HomeState = {
  layout: LAYOUT.COLUMNS,
  sort: SORT.TIMELINE,
  reach: REACH.ALL,
  content: CONTENT.ALL,
};

// Action types for DevTools
export enum HomeActionTypes {
  SET_HOME_LAYOUT = 'SET_HOME_LAYOUT',
  SET_HOME_SORT = 'SET_HOME_SORT',
  SET_HOME_REACH = 'SET_HOME_REACH',
  SET_HOME_CONTENT = 'SET_HOME_CONTENT',
  RESET_HOME = 'RESET_HOME',
}
