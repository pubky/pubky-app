import { Table } from 'dexie';
import { db } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError } from '@/libs/error/error.utils';
import type { BookmarkedPostDetails, BookmarkModelSchema } from '@/models/bookmark/bookmark.schema';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { RecordModelBase } from '@/models/shared/base/record/baseRecord';

export class BookmarkModel extends RecordModelBase<string, BookmarkModelSchema> implements BookmarkModelSchema {
  static table: Table<BookmarkModelSchema> = db.table('bookmarks');

  created_at: number;

  constructor(bookmark: BookmarkModelSchema) {
    super(bookmark);
    this.created_at = bookmark.created_at;
  }

  /**
   * Find all bookmarks (for current user)
   * Returns array of post IDs
   */
  static async findAll(): Promise<string[]> {
    try {
      const bookmarks = await this.table.toArray();
      return bookmarks.map((b) => b.id);
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, `Failed to read all records from ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'findAll',
        context: { table: this.table.name },
        cause: error,
      });
    }
  }

  /**
   * Get bookmarks sorted by creation time (most recent first).
   *
   * Implementation note: uses a full table scan + JS sort instead of
   * `orderBy('created_at').reverse()`. IndexedDB index cursors silently
   * exclude records whose indexed key is `undefined`, which means any
   * historically-bad write that left `created_at` unset would become
   * invisible to the previous index-based query (the root cause of the
   * "FollowedCollections empty while Discover shows Unfollow" bug).
   *
   * Rows missing a numeric `created_at` are treated as oldest so they
   * still surface; new writes go through the persist path which now
   * guarantees a numeric value.
   *
   * The bookmarks table is per-user and small, so the O(n log n) JS sort
   * is a non-issue at our scale.
   */
  static async findAllSorted(): Promise<BookmarkModelSchema[]> {
    try {
      return this.sortNewestFirst(await this.table.toArray());
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, `Failed to read sorted records from ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'findAllSorted',
        context: { table: this.table.name },
        cause: error,
      });
    }
  }

  /**
   * Every bookmark, newest first (as `findAllSorted`), with the cached details of its post
   * (`undefined` while the post is not cached), in one read transaction over `bookmarks` and
   * `post_details`.
   *
   * The details read is chained on the Dexie promise of the bookmarks read, not issued after the
   * layers above have awaited it. A live query observes a read through the zone (PSD) the read is
   * issued in; Dexie restores that zone across native `await`s only with a best-effort echo whose
   * bookkeeping is one counter shared by every live query in flight, and a neighbouring live query
   * awaiting a Dexie promise meanwhile can end it. A dependent read issued after such hops then runs
   * in the global zone, is never observed, and the live query stays on its first result for good
   * (the Followed Collections stall, F-QA6-2). A Dexie `then` callback re-enters its zone explicitly.
   */
  static async findAllWithPostDetails(): Promise<BookmarkedPostDetails[]> {
    try {
      return await db.transaction('r', [this.table, PostDetailsModel.table], () =>
        this.table.toArray().then((all) => {
          const bookmarks = this.sortNewestFirst(all);
          if (bookmarks.length === 0) return [];
          // Called inside the Dexie callback, so its `bulkGet` is issued in this zone and transaction.
          return PostDetailsModel.findByIdsPreserveOrder(bookmarks.map(({ id }) => id)).then((details) =>
            bookmarks.map(({ id, created_at }, index) => ({ id, created_at, details: details[index] })),
          );
        }),
      );
    } catch (error) {
      // The details read already reports as an AppError; only a failed transaction or bookmarks read is new.
      if (isAppError(error)) throw error;
      throw Err.database(
        DatabaseErrorCode.QUERY_FAILED,
        `Failed to read records from ${this.table.name} with their post details`,
        {
          service: ErrorService.Local,
          operation: 'findAllWithPostDetails',
          context: { table: this.table.name },
          cause: error,
        },
      );
    }
  }

  /** Newest bookmark first; a row without a numeric `created_at` counts as oldest so it still surfaces. */
  private static sortNewestFirst(bookmarks: BookmarkModelSchema[]): BookmarkModelSchema[] {
    return bookmarks.sort((a, b) => {
      const aAt = typeof a.created_at === 'number' ? a.created_at : 0;
      const bAt = typeof b.created_at === 'number' ? b.created_at : 0;
      return bAt - aAt;
    });
  }
}
