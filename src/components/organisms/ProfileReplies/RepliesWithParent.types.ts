import type { PostStreamId } from '@/models/stream/post/postStream.types';

export interface RepliesWithParentProps {
  /**
   * Stream ID for the replies timeline
   */
  streamId: PostStreamId;
}

export interface ReplyWithParentProps {
  replyPostId: string;
}
