export const PROFILE_PAGE_TYPES = {
  PROFILE: 'profile',
  NOTIFICATIONS: 'notifications',
  POSTS: 'posts',
  REPLIES: 'replies',
  FOLLOWERS: 'followers',
  FOLLOWING: 'following',
  FRIENDS: 'friends',
  UNIQUE_TAGS: 'unique_tags',
} as const;

export type ProfilePageType =
  | typeof PROFILE_PAGE_TYPES.PROFILE
  | typeof PROFILE_PAGE_TYPES.NOTIFICATIONS
  | typeof PROFILE_PAGE_TYPES.POSTS
  | typeof PROFILE_PAGE_TYPES.REPLIES
  | typeof PROFILE_PAGE_TYPES.FOLLOWERS
  | typeof PROFILE_PAGE_TYPES.FOLLOWING
  | typeof PROFILE_PAGE_TYPES.FRIENDS
  | typeof PROFILE_PAGE_TYPES.UNIQUE_TAGS;

export type FilterBarPageType = Exclude<ProfilePageType, typeof PROFILE_PAGE_TYPES.PROFILE>;
