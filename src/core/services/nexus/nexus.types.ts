import type { Pubky, Timestamp } from '@/models/models.types';
import type { TagModel } from '@/models/shared/tag/tag';

/**
 * Nexus API Types
 *
 * This file contains type definitions for the Nexus API contract:
 * - Request parameter types (pagination, filtering, sorting)
 * - Response types (users, posts, tags, files, notifications)
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
 * Bookmark metadata from Nexus API.
 *
 * Shape mirrors the upstream OpenAPI `Bookmark` schema
 * (`/v0/post/{author_id}/{post_id}/bookmark`):
 *   - `id`: the bookmark record's id on Nexus.
 *   - `indexed_at`: epoch-ms timestamp Nexus assigned when it indexed the
 *     bookmark. We use this as the local `created_at` ordering key.
 *
 * Historical note: an earlier `{ created_at, updated_at }` shape was kept
 * here that did not match what the API actually returned. That mismatch
 * caused the bookmarks table to be written with `created_at: undefined`,
 * which is silently excluded from IndexedDB index cursors and broke the
 * `FollowedCollections` live query. See `LocalStreamPostsService.persistPosts`
 * for the write-site coercion.
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
  bookmarks: number;
};

/** Relationship status between the viewer and a user */
export type NexusUserRelationship = {
  following: boolean;
  followed_by: boolean;
};

// =============================================================================
// Response Types - Tags
// =============================================================================

/** Tag with associated taggers information */
export type NexusTag = {
  label: string;
  taggers: Pubky[];
  taggers_count: number;
  /** Whether the viewer has a relationship with any tagger */
  relationship: boolean;
};

/** List of users who applied a specific tag */
export type NexusTaggers = {
  relationship: boolean;
  users: Pubky[];
};

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

/** Complete user object from Nexus API */
export type NexusUser = {
  details: NexusUserDetails;
  counts: NexusUserCounts;
  tags: NexusTag[];
  relationship: NexusUserRelationship;
};

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
   * Post kind/type as a string.
   * Note: Using string instead of PubkyAppPostKind enum to avoid indexing issues.
   * @see https://github.com/pubky/pubky-app-specs/issues/74
   */
  kind: string;
  uri: string;
  attachments: string[] | null;
};

/** Aggregate counts for post engagement */
export type NexusPostCounts = {
  tags: number;
  unique_tags: number;
  replies: number;
  reposts: number;
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

/** Complete post object from Nexus API */
export type NexusPost = {
  details: NexusPostDetails;
  counts: NexusPostCounts;
  tags: TagModel[];
  relationships: NexusPostRelationships;
  bookmark: NexusBookmark | null;
};

/** Paginated post stream response with cursor for pagination */
export type NexusPostsKeyStream = {
  post_keys: string[];
  /** Score of the last post, used as cursor for next page */
  last_post_score: number;
};

/** Post with attachment metadata */
export type NexusPostWithAttachmentMetadata = NexusPost & {
  attachments_metadata?: NexusFileDetails[];
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
