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
   * Get bookmarks sorted by creation time (most recent first)
   */
  static async findAllSorted(): Promise<BookmarkModelSchema[]> {
    try {
      return await this.table.orderBy('created_at').reverse().toArray();
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
