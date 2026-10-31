import type { BookmarkModelSchema } from '@/models/bookmark/bookmark.schema';

export type TBookmarkReconcileParams = {
  /** Every bookmark the homeserver listing names, `created_at` resolved; upserted by id. */
  bookmarks: BookmarkModelSchema[];
  /** `LocalBookmarkService.captureWriteSequence()` taken before the listing started. */
  since: number;
  /** Checked inside the transaction: when false, nothing is written. */
  isCurrent?: () => boolean;
};
