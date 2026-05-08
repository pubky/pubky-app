import type { Pubky } from '@/models/models.types';
import type { PostStreamId, ReplyStreamCompositeId } from '@/models/stream/post/postStream.types';
import type { NexusFileDetails, NexusPostWithAttachmentMetadata } from '@/services/nexus/nexus.types';
import type { TStreamBase } from '@/services/nexus/stream/posts/postStream.types';

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
}

export interface TPersistPostsParams {
  posts: NexusPostWithAttachmentMetadata[];
}

export interface TPostStreamPersistResult {
  attachmentMetadata: NexusFileDetails[];
}

export interface TSetStreamPaginationParams {
  params: TStreamBase;
  streamTail: number;
  streamHead?: number;
}
