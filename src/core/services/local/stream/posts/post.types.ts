import type { Pubky } from '@/models/models.types';
import type { PostStreamId, ReplyStreamCompositeId } from '@/models/stream/post/postStream.types';
import type { NexusFileDetails, NexusPostWithAttachmentMetadata } from '@/services/nexus/nexus.types';
import type { StreamSource, TStreamBase } from '@/services/nexus/stream/posts/postStream.types';

export interface TStreamResult {
  stream: string[];
}

export interface TPostStreamUpsertParams {
  streamId: PostStreamId;
  stream: string[];
}

export interface TPostStreamBulkParams {
  postStreams: TPostStreamUpsertParams[];
}

export interface TPostDetailsTimestampParams {
  postCompositeId: string;
}

export interface TPrependToStreamParams {
  streamId: PostStreamId;
  compositePostId: string;
}

export interface TAddReplyToStreamParams {
  repliedUri: string | null | undefined;
  replyPostId: string;
  postReplies: Record<ReplyStreamCompositeId, string[]>;
}

export interface THandleNotCommonStreamParamsParams {
  authorId: Pubky;
  postId: string | undefined;
  invokeEndpoint: StreamSource;
}

export interface TPersistPostsParams {
  posts: NexusPostWithAttachmentMetadata[];
  /**
   * Set by the TTL refresh path. A post's details are kept (counts, tags,
   * relationships and TTL still refresh) when the local row is newer than the
   * Nexus copy: its TTL row was written at or after `fetchStartedAt`, or the
   * Nexus copy is not indexed after the local one. The check and the writes
   * run in one transaction so a local-first edit cannot slip in between.
   */
  refreshGuard?: { fetchStartedAt: number };
}

export interface TPostStreamPersistResult {
  attachmentMetadata: NexusFileDetails[];
}

export interface TSetStreamPaginationParams {
  params: TStreamBase;
  streamTail: number;
  streamHead?: number;
  invokeEndpoint: StreamSource;
}
