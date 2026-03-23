export interface UseThreadRepliesOptions {
  /**
   * Maximum number of replies to show initially
   * @default 3
   */
  maxReplies?: number;
}

export interface UseThreadRepliesResult {
  /** Array of reply post IDs in chronological order (oldest first) */
  replyIds: string[];
  /** Total reply count (adjusted for muted users) */
  totalCount: number;
  /** Whether there are more replies than currently shown */
  hasMore: boolean;
  /** Whether the hook is in "show all" mode */
  showAll: boolean;
  /** Whether expand-all pagination is currently running */
  isExpandingAll: boolean;
  /** Expand to show all remaining replies inline */
  expandAll: () => Promise<void>;
}
