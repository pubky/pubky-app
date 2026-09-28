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
