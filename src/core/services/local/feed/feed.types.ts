import type { FeedModelSchema } from '@/models/feed/feed.schema';

export type TFeedWriteResult = {
  persisted: FeedModelSchema;
  /** The row as it was before the write, read in the same transaction; `null` when the write created it. */
  prior: FeedModelSchema | null;
};

export type TFeedRollbackParams = {
  feedId: string;
  /** `updated_at` stamped by the write being undone; a row carrying any other value is left alone. */
  expectedUpdatedAt: number;
  /** The row as it was before the write, or `null` when the write created it. */
  priorFeed: FeedModelSchema | null;
};

export type TFeedReconcileParams = {
  /** The feeds the listing holds, decoded; upserted by id. */
  feeds: FeedModelSchema[];
  /** The ids the listing names; every other row goes. */
  keepIds: ReadonlySet<string>;
  /** Checked inside the transaction: when false, nothing is written. */
  isCurrent?: () => boolean;
};

export type TFeedReconcileResult = {
  /** False when `isCurrent` refused the write; then nothing changed. */
  applied: boolean;
  persisted: FeedModelSchema[];
  /** The rows the listing no longer named, now deleted. */
  removed: FeedModelSchema[];
};
