import type {
  KnownFeedLayout,
  KnownFeedReach,
  KnownFeedSort,
  KnownFeedTarget,
  KnownPostKind,
} from 'pubky-social-specs';

/** The members of a resources feed's saved filters (the specs' `filters`), in their stored order. */
export const FEED_RESOURCE_FILTER_NAMES = [
  'when',
  'from',
  'to',
  'near',
  'radius',
  'place',
  'category',
  'host',
  'key',
  'remote',
  'closed',
  'ingredients',
  'sort',
  'window',
  'rows',
  'exclude_types',
] as const;

export type TFeedResourceFilterName = (typeof FEED_RESOURCE_FILTER_NAMES)[number];

/**
 * A resources feed's saved filters as the specs store them (`feed.filters`): each one a string, as
 * the index takes it, and left out when not set.
 */
export type TFeedResourceFilters = Partial<Record<TFeedResourceFilterName, string>>;

export interface FeedModelSchema {
  id: string;
  name: string;
  /**
   * Lucide icon name in kebab-case.
   * Optional because 0.x feeds created before the 0.7 spec added icons have none.
   */
  icon?: string;
  tags: string[];
  domain_tags: string[];
  reach: KnownFeedReach;
  sort: KnownFeedSort;
  content: KnownPostKind | null;
  layout: KnownFeedLayout;
  /**
   * What the feed lists: `resources` for external resources (then `content` is null and
   * `domain_tags` empty). Absent for posts, as on every row written before the field existed.
   * Not indexed, so the index map and `DB_VERSION` are unchanged.
   */
  target?: KnownFeedTarget;
  /**
   * The schema.org types a feed of external resources lists, up to 10 (the specs keep them in
   * `content`, sorted); absent for every type and on a post feed. Not indexed.
   */
  resource_types?: string[] | null;
  /**
   * A feed of external resources' saved search filters (When, Where, Category…), as the specs store
   * them (`TFeedResourceFilters`); absent for none and on a post feed. Not indexed.
   */
  resource_filters?: TFeedResourceFilters | null;
  created_at: number;
  updated_at: number;
}

// Schema design rationale:
// - &id: Primary key (string, HashId-derived)
// - created_at: For sorting feeds by creation time
export const feedTableSchema = '&id, created_at';
