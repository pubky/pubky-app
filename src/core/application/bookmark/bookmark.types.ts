import type { Pubky } from '@/models/models.types';

export type TBookmarkPersistInput = {
  postId: string; // Composite post ID (authorId:postId)
  /** The user bookmarking, whose sync lock the write holds. */
  userId: Pubky;
  bookmarkUrl: string;
  /** The bytes to PUT; absent on a delete. */
  bookmarkBody?: Uint8Array;
  /**
   * Whether the account the write started for is still the current one; checked once the sync lock
   * is held, before the local write and again before the homeserver write. A write that waited on
   * the lock may start after a logout cleared the database, which then belongs to the next account.
   */
  isCurrent?: () => boolean;
};

export interface TBookmarkFetchOptions {
  /** Whether the account the fetch started for is still the current one; checked before the local write. */
  isCurrent?: () => boolean;
}
