import type { Pubky, Timestamp } from '@/models/models.types';

/**
 * Nexus API Types
 *
 * This file contains type definitions for the Nexus API contract:
 * - Request parameter types (pagination, filtering, sorting)
 * - Response types (users, posts, tags, files, notifications)
 *
 * A `*Wire` type is a response as the `/v1` API serves it; the type without the suffix is the same
 * response once the read boundary (the Nexus services, through `PostNormalizer.fromNexus`,
 * `UserNormalizer.fromNexus` and `TagNormalizer.fromNexus`) has folded the post kinds into the local
 * vocabulary and derived the tag `relationship`. Everything past the services sees the folded form.
 *
 * For internal utility types (URL building, fetch options), see `nexus.utils.types.ts`
 */

// =============================================================================
// Request Parameter Types & Enums
// =============================================================================

/** Sorting options for stream endpoints */
export enum StreamSorting {
  TIMELINE = 'timeline',
  ENGAGEMENT = 'total_engagement',
}

/** User identifier parameter */
export type TUserId = {
  user_id: Pubky;
};

/** Standard pagination with skip/limit */
export type TPaginationParams = {
  skip?: number;
  limit?: number;
};

/** Range-based pagination with start/end indices */
export type TPaginationRangeParams = {
  start?: number;
  end?: number;
};

/** Parameter to skip tags in responses */
export type TSkipTagsParams = {
  skip_tags?: number;
};

/** Pagination parameters specific to tag-related endpoints */
export type TTagsPaginationParams = {
  limit_tags?: number;
  limit_taggers?: number;
};

/**
 * The target reach of the source. Supported just for 'influencers' source
 * @example "source=influencers&reach=followers" will return influencers with followers reach
 */
export enum UserStreamReach {
  FOLLOWERS = 'followers',
  FOLLOWING = 'following',
  FRIENDS = 'friends',
  WOT = 'wot',
}

/**
 * Composite reach type for userId:reach format.
 * Excludes WOT as it's not supported in this context.
 */
export type UserStreamCompositeReach = Exclude<UserStreamReach, UserStreamReach.WOT>;

/** Timeframe filter for user stream endpoints */
export enum UserStreamTimeframe {
  TODAY = 'today',
  THIS_WEEK = 'this_week',
  THIS_MONTH = 'this_month',
  ALL_TIME = 'all_time',
}

/** Combined reach and timeframe parameters for user streams */
export type TUserStreamReachParams = {
  reach?: UserStreamReach;
  timeframe?: UserStreamTimeframe;
};

// =============================================================================
// Response Types - Common
// =============================================================================

/**
 * Bookmark metadata from the frozen `/v0` Nexus API.
 *
 * Shape mirrors the `/v0` OpenAPI `Bookmark` schema (`/post/{author_id}/{post_id}/bookmark`, a route
 * `/v1` dropped): `id` is the bookmark record's id on Nexus, `indexed_at` the epoch-ms time Nexus
 * indexed it.
 *
 * 0.x ghosts, never read: a v1 bookmark is private and invisible to Nexus, so this only ever
 * describes a 0.x copy the app cannot delete (ADR-0028). `/v1` serves no bookmark field at all.
 */
export type NexusBookmark = {
  id: string;
  indexed_at: number;
};

// =============================================================================
// Response Types - User
// =============================================================================

/** External link associated with a user profile */
export type NexusUserLink = {
  title: string;
  url: string;
};

/** Primary user profile details from Nexus API */
export type NexusUserDetails = {
  name: string;
  bio: string;
  id: Pubky;
  links: NexusUserLink[] | null;
  status: string | null;
  image: string | null;
  indexed_at: Timestamp;
  /**
   * `true` when the user is a tombstone (profile cleared, `name` empty). Absent on Nexus builds
   * that predate the flag, which marked tombstones with the `[DELETED]` name instead.
   */
  deleted?: boolean;
};

/** Aggregate counts for a user's activity and social connections */
export type NexusUserCounts = {
  /** Number of tags assigned by this user to other entities (users or posts) */
  tagged: number;
  /** Number of tags received by this user from other users */
  tags: number;
  /** Number of unique/distinct tags received by this user */
  unique_tags: number;
  posts: number;
  replies: number;
  collections: number;
  following: number;
  followers: number;
  friends: number;
  /**
   * 0.x ghosts, never read: bookmarks are counted locally (ADR-0028). `/v0` served the count; `/v1`
   * does not, so a row persisted from it carries `UserCountsModel`'s default of `0`.
   */
  bookmarks?: number;
};

/** Relationship status between the viewer and a user */
export type NexusUserRelationship = {
  following: boolean;
  followed_by: boolean;
};

/**
 * How established an account is in the follow graph, computed by Nexus from its
 * seeded trust ranking. Nexus picks the tier and never exposes the raw score.
 *
 * Describes position in the graph, not character: it is not an endorsement.
 */
export enum NexusSocialGraphStatus {
  /** Little or no network presence (unreachable from the seed set, or brand new) */
  NEW = 'new',
  /** Part of the broader network (reachable from the seed set) */
  NETWORKED = 'networked',
  /** Central to the network (top slice of the ranking) */
  ESTABLISHED = 'established',
}

// =============================================================================
// Response Types - Tags
// =============================================================================

/** Tag with associated taggers information, as the app and the local tables hold it */
export type NexusTag = {
  label: string;
  taggers: Pubky[];
  taggers_count: number;
  /**
   * Whether the request's viewer tagged the entity with this label. `/v0` served it; `/v1` does not, so
   * the read boundary derives it from `tag_uri` (`TagNormalizer.fromNexus`): `false` without a viewer.
   */
  relationship: boolean;
  /** The viewer's own tag file for this label; null when they have not tagged it. Absent in rows cached before Nexus returned it. */
  tag_uri?: string | null;
};

/** A tag as Nexus serves it: `relationship` only on `/v0`, `tag_uri` says the same on both. */
export type NexusTagWire = Omit<NexusTag, 'relationship'> & Partial<Pick<NexusTag, 'relationship'>>;

/** List of users who applied a specific tag, as the app holds it */
export type NexusTaggers = {
  /** Whether the request's viewer is one of the taggers; derived from `tag_uri` on `/v1` (see `NexusTag`). */
  relationship: boolean;
  users: Pubky[];
  /** The viewer's own tag file for this label; null when they have not tagged it. */
  tag_uri?: string | null;
};

/** Taggers as Nexus serves them: `relationship` only on `/v0`. */
export type NexusTaggersWire = Omit<NexusTaggers, 'relationship'> & Partial<Pick<NexusTaggers, 'relationship'>>;

/** Trending/hot tag with engagement metrics */
export type NexusHotTag = {
  label: string;
  taggers_id: Pubky[];
  tagged_count: number;
  taggers_count: number;
};

// =============================================================================
// Response Types - User (Composite)
// =============================================================================

/** Complete user object from Nexus API, past the read boundary */
export type NexusUser = {
  details: NexusUserDetails;
  counts: NexusUserCounts;
  tags: NexusTag[];
  relationship: NexusUserRelationship;
  /**
   * Social graph badge tier. `null` when Nexus has no ranking available, which
   * hides the badge and is distinct from `new`. Absent on Nexus builds that
   * predate the field.
   */
  social_graph_status?: NexusSocialGraphStatus | null;
};

/** A user as Nexus serves it: tags without `relationship` (`UserNormalizer.fromNexus` derives it). */
export type NexusUserWire = Omit<NexusUser, 'tags'> & { tags: NexusTagWire[] };

/** Stream response containing only user identifiers */
export type NexusUserIdsStream = Pubky[];

// =============================================================================
// Response Types - Post
// =============================================================================

/** Primary post details from Nexus API */
export type NexusPostDetails = {
  id: string;
  content: string;
  indexed_at: number;
  author: Pubky;
  /**
   * Post kind as a string, in the local vocabulary (`short`, `long`, `image`, ...). Nexus `/v1` serves
   * the stored names (`note`, `article`); the read boundary folds them (`toLocalPostKindFromNexus`,
   * through `PostNormalizer.fromNexus`) and keeps any name it does not know, `unknown` included.
   */
  kind: string;
  uri: string;
  attachments: string[] | null;
  /** URL of the post's public `lock.json`. Present = lock teaser; the sole lock-detection signal. */
  lock?: string | null;
  /**
   * `true` when the post is a tombstone (content cleared). Absent on Nexus builds that predate
   * the flag, which marked tombstones with the `[DELETED]` content instead.
   */
  deleted?: boolean;
};

/** Aggregate counts for post engagement */
export type NexusPostCounts = {
  tags: number;
  unique_tags: number;
  replies: number;
  reposts: number;
  /**
   * Collections that curate this post (pubky-nexus#1067). Optional because rows
   * persisted before the field existed carry no value; read it as `?? 0`.
   */
  collections?: number;
};

/** Post relationship data (replies, reposts, mentions) */
export type NexusPostRelationships = {
  /** URI of the post this is replying to, if any */
  replied: string | null;
  /** URI of the post this is reposting, if any */
  reposted: string | null;
  /** Users mentioned in this post */
  mentioned: Pubky[];
};

/** Complete post object from Nexus API, past the read boundary */
export type NexusPost = {
  details: NexusPostDetails;
  counts: NexusPostCounts;
  tags: NexusTag[];
  relationships: NexusPostRelationships;
  /**
   * 0.x ghosts, never read: bookmarks are hydrated from the homeserver listing (ADR-0028). `/v0`
   * served the field; `/v1` does not.
   */
  bookmark?: NexusBookmark | null;
};

/** Post details as Nexus serves them: `kind` in the wire vocabulary (`note`, `article`, ...), before the fold. */
export type NexusPostDetailsWire = NexusPostDetails;

/** A post as Nexus serves it: `details.kind` in the wire vocabulary, tags without `relationship`. */
export type NexusPostWire = Omit<NexusPost, 'details' | 'tags'> & {
  details: NexusPostDetailsWire;
  tags: NexusTagWire[];
};

/** Paginated post stream response with cursor for pagination */
export type NexusPostsKeyStream = {
  post_keys: string[];
  /** Score of the last post, used as cursor for next page. Null for skip-paginated streams
   * (engagement, single-collection), which page by offset instead. */
  last_post_score: number | null;
};

// =============================================================================
// Response Types - Notification
// =============================================================================

/** Notification from Nexus API */
export type NexusNotification = {
  timestamp: number;
  /** Generic body object - structure varies by notification type */
  body: Record<string, unknown>;
};

// =============================================================================
// Response Types - File
// =============================================================================

/** File metadata from Nexus API */
export type NexusFileDetails = {
  id: string;
  name: string;
  src: string;
  /** MIME type of the file (e.g., 'image/png') */
  content_type: string;
  /** File size in bytes */
  size: number;
  created_at: Timestamp;
  indexed_at: Timestamp;
  metadata: Record<string, string>;
  owner_id: string;
  uri: string;
  urls: NexusFileUrls;
};

/** CDN URLs for different file sizes/formats */
export type NexusFileUrls = {
  /** URL for feed-optimized version */
  feed: string;
  /** URL for full-size version */
  main: string;
  /** URL for thumbnail/small version */
  small: string;
};
