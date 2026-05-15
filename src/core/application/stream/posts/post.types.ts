import type { Pubky } from '@/models/models.types';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import type { NexusPost } from '@/services/nexus/nexus.types';
import type { StreamOrder } from '@/services/nexus/stream/posts/postStream.types';

export interface TFetchStreamParams {
  streamId: PostStreamId;
  streamHead: number;
  streamTail: number;
  limit: number;
  /** Optional viewer ID for relationship data. Null for unauthenticated views. */
  viewerId: Pubky | null;
  lastPostId?: string;
  tags?: string[];
  order?: StreamOrder;
}

export interface TInitialStreamParams {
  streamId: PostStreamId;
  limit: number;
  cachedStream: { stream: string[] } | null;
}

export interface TPostStreamChunkResponse {
  nextPageIds: string[];
  cacheMissPostIds: string[];
  timestamp: number | undefined;
  /** True only if we've reached the actual end of the stream (Nexus returned fewer posts than limit).
   * False if we hit MAX_FETCH_ITERATIONS or filled the limit. */
  reachedEnd?: boolean;
}

export interface TPartialCacheHitParams {
  cachedStreamChunk: string[];
  limit: number;
  streamTail: number;
  streamId: PostStreamId;
  /** Optional viewer ID for relationship data. Null for unauthenticated views. */
  viewerId: Pubky | null;
}

export interface TMissingPostsParams {
  cacheMissPostIds: string[];
  /** Optional viewer ID for relationship data. Null/undefined for unauthenticated views. */
  viewerId?: Pubky | null;
}

export interface TCacheStreamParams {
  lastPostId: string | undefined;
  limit: number;
  cachedStream: { stream: string[] };
}

export interface TFetchMissingUsersParams {
  posts: NexusPost[];
  /** Optional viewer ID for relationship data. Null/undefined for unauthenticated views. */
  viewerId?: Pubky | null;
}

export interface TPersistUnreadNewStreamChunkParams {
  streamId: PostStreamId;
  compositePostIds: string[];
}

/**
 * Entry stored in the in-memory queue for overflow posts between pagination requests.
 * @property posts - Array of composite post IDs (authorPubky:postId) not yet returned to UI
 * @property cursor - The last timestamp used for pagination
 */
export interface TQueueEntry {
  posts: string[];
  cursor: number;
}
