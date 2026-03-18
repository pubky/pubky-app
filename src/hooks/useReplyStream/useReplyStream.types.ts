export interface UseReplyStreamOptions {
  /** Maximum number of replies to show initially before "show more" */
  maxReplies: number;
  /** Whether fetching is enabled (set to false to disable, e.g. when depth >= maxDepth) */
  enabled?: boolean;
}

export interface UseReplyStreamResult {
  /** Array of reply post IDs in chronological order (oldest first) */
  replyIds: string[];
  /** Total reply count adjusted for muted users */
  adjustedTotalCount: number;
  /** Whether there are more replies than currently shown */
  hasMore: boolean;
  /** Whether the hook is in "show all" mode */
  showAll: boolean;
  /** Whether expand-all pagination is currently running */
  isExpandingAll: boolean;
  /** Expand to show all remaining replies inline */
  expandAll: () => Promise<void>;
}
