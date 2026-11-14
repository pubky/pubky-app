import { APP_FEED_CONTENT, APP_FEED_REACH, APP_SUPPORTED_LAYOUT, APP_SUPPORTED_SORT } from './feed';

export const FEED_CATALOG = {
  schema: 'pubchi-feed-catalog',
  version: 2,
  fields: [
    {
      name: 'name',
      values: [],
      meaning: 'The user-facing name of the feed.',
      authoring: 'Required; one to 100 characters.',
    },
    { name: 'icon', values: [], meaning: 'The feed icon identifier.', authoring: 'Optional.' },
    { name: 'tags', values: [], meaning: 'Post tags to include.', authoring: 'Optional; at most five tags.' },
    {
      name: 'domain_tags',
      values: [],
      meaning: 'Profile or domain tags to include.',
      authoring: 'Optional; at most five tags.',
    },
    {
      name: 'reach',
      values: APP_FEED_REACH,
      meaning: 'Which relationship audience supplies posts.',
      authoring: 'Followers is not authorable by this App.',
    },
    {
      name: 'sort',
      values: APP_SUPPORTED_SORT,
      meaning: 'How matching posts are ordered.',
      authoring: 'Recent or popularity; likes are not supported.',
    },
    {
      name: 'layout',
      values: APP_SUPPORTED_LAYOUT,
      meaning: 'How matching posts are displayed.',
      authoring: 'Columns, wide, visual, or list.',
    },
    {
      name: 'content',
      values: APP_FEED_CONTENT,
      meaning: 'Which content kinds are included.',
      authoring: 'Omit for all content; unknown is not authorable.',
    },
  ],
} as const;

export type FeedCatalog = typeof FEED_CATALOG;
