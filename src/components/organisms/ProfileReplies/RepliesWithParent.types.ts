import * as Core from '@/core';

export interface RepliesWithParentProps {
  /**
   * Stream ID for the replies timeline
   */
  streamId: Core.PostStreamId;
}

export interface ReplyWithParentProps {
  replyPostId: string;
  onPostClick: (postId: string) => void;
}
