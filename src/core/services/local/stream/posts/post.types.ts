import * as Core from '@/core';

export interface TStreamResult {
  stream: string[];
}

export interface TPostStreamUpsertParams {
  streamId: Core.PostStreamId;
  stream: string[];
}

export interface TPostStreamBulkParams {
  postStreams: TPostStreamUpsertParams[];
}

export interface TPostDetailsTimestampParams {
  postCompositeId: string;
}

export interface TPrependToStreamParams {
  streamId: Core.PostStreamId;
  compositePostId: string;
}

export interface TAddReplyToStreamParams {
  repliedUri: string | null | undefined;
  replyPostId: string;
  postReplies: Record<Core.ReplyStreamCompositeId, string[]>;
}

export interface THandleNotCommonStreamParamsParams {
  authorId: Core.Pubky;
  postId: string | undefined;
}

export interface TPersistPostsParams {
  posts: Core.NexusPostWithAttachmentMetadata[];
}

export interface TPostStreamPersistResult {
  attachmentMetadata: Core.NexusFileDetails[];
}

export interface TSetStreamPaginationParams {
  params: Core.TStreamBase;
  streamTail: number;
  streamHead?: number;
}
