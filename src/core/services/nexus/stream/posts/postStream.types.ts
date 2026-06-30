import type { Pubky } from '@/models/models.types';
import type { StreamSorting, TPaginationParams, TPaginationRangeParams } from '@/services/nexus/nexus.types';

export enum STREAM_PREFIX {
  POSTS = 'v0/stream/posts',
  POSTS_KEYS = 'v0/stream/posts/keys',
  POSTS_BY_IDS = 'v0/stream/posts/by_ids',
}

export enum StreamSource {
  ALL = 'all',
  FOLLOWING = 'following',
  FOLLOWERS = 'followers',
  FRIENDS = 'friends',
  BOOKMARKS = 'bookmarks',
  REPLIES = 'post_replies',
  AUTHOR = 'author',
  AUTHOR_REPLIES = 'author_replies',
  COLLECTION = 'collection',
}

export enum StreamKind {
  SHORT = 'short',
  LONG = 'long',
  IMAGE = 'image',
  VIDEO = 'video',
  LINK = 'link',
  FILE = 'file',
  COLLECTION = 'collection',
}

export enum StreamOrder {
  ASCENDING = 'ascending',
  DESCENDING = 'descending',
}

export type TStreamAuthorId = {
  author_id: Pubky;
};

export type TStreamSource = {
  value: string;
};

// Base parameters that are always optional
export type TStreamBase = TPaginationParams &
  TPaginationRangeParams & {
    // The content viewer (for personalization like bookmarks, relationships)
    viewer_id?: Pubky;
    sorting?: StreamSorting;
    kind?: StreamKind;
    order?: StreamOrder;
    tags?: string; // Max 5 tags
  };

// Specific parameter types for each source
export type TStreamWithObserverParams = TStreamBase & {
  // The user whose content stream we're accessing (e.g., "alice_pubky" for Alice's following feed)
  observer_id: Pubky;
};

export type TStreamPostRepliesParams = TStreamBase &
  TStreamAuthorId & {
    post_id: string;
  };

export type TStreamAuthorParams = TStreamBase & TStreamAuthorId;

export type TStreamAuthorRepliesParams = TStreamBase & TStreamAuthorId;

export type TStreamCollectionParams = TStreamBase &
  TStreamAuthorId & {
    post_id: string;
  };

export type TStreamAllParams = TStreamBase;

// Posts by IDs endpoint
export type TStreamPostsByIdsParams = {
  post_ids: string[]; // Required array of post IDs
  viewer_id?: Pubky; // Optional viewer ID
  include_attachment_metadata?: boolean; // Optional include attachment metadata
};

export type TStreamQueryParams =
  | TStreamWithObserverParams
  | TStreamPostRepliesParams
  | TStreamAuthorParams
  | TStreamAuthorRepliesParams
  | TStreamCollectionParams
  | TStreamAllParams
  | TStreamPostsByIdsParams;

/**
 * Extra parameters needed for specific stream sources
 */
export type TStreamExtraParams = {
  author_id?: string;
  post_id?: string;
};

export type TPostStreamFetchParams = {
  params: TStreamBase;
  invokeEndpoint: StreamSource;
  extraParams: TStreamExtraParams;
};

/**
 * Breakdown of a stream ID into its components
 * [sorting, invokeEndpoint, kind, tags]
 */
export type TStreamIdBreakdown = [
  sorting: string,
  invokeEndpoint: StreamSource,
  kind: string | undefined,
  tags: string | undefined,
];
