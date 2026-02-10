export interface UseNestedRepliesOptions {
  /**
   * Maximum number of nested replies to show
   * @default 3
   */
  maxNestedReplies?: number;
  /**
   * Current depth level (0 = top level reply)
   * @default 0
   */
  depth?: number;
  /**
   * Maximum depth to fetch nested replies
   * @default 1
   */
  maxDepth?: number;
}

export interface UseNestedRepliesResult {
  /**
   * Array of nested reply post IDs in chronological order (oldest first)
   */
  nestedReplyIds: string[];
  /**
   * Whether there are more replies than what's shown
   */
  hasMoreReplies: boolean;
  /**
   * Whether there are any nested replies
   */
  hasNestedReplies: boolean;
  /**
   * Total count of replies (from post counts)
   */
  replyCount: number;
  /**
   * Whether all replies are being shown (showAll mode)
   */
  showAll: boolean;
  /**
   * Expand to show all remaining nested replies inline
   */
  expandAll: () => void;
}
