export interface ReplyWithNestedProps {
  /** The composite ID of the reply post */
  replyId: string;
  /** Whether this is the last reply in the main list */
  isLastReply?: boolean;
  /** Click handler to navigate to the post */
  onPostClick: (postId: string) => void;
  /** Current nesting depth (to prevent infinite nesting) */
  depth?: number;
  /** Maximum nesting depth allowed */
  maxDepth?: number;
}
