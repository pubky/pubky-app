import { Table } from 'dexie';
import { db } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { BookmarkModelSchema } from '@/models/bookmark/bookmark.schema';
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
      const all = await this.table.toArray();
      return all.sort((a, b) => {
        const aAt = typeof a.created_at === 'number' ? a.created_at : 0;
        const bAt = typeof b.created_at === 'number' ? b.created_at : 0;
        return bAt - aAt;
      });
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, `Failed to read sorted records from ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'findAllSorted',
        context: { table: this.table.name },
        cause: error,
      });
    }
  }
}
