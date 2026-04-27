import { Table } from 'dexie';
import * as Core from '@/core';
import { RecordModelBase } from '@/core/models/shared/base/record/baseRecord';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

export class BookmarkModel
  extends RecordModelBase<string, Core.BookmarkModelSchema>
  implements Core.BookmarkModelSchema
{
  static table: Table<Core.BookmarkModelSchema> = Core.db.table('bookmarks');

  created_at: number;

  constructor(bookmark: Core.BookmarkModelSchema) {
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
  static async findAllSorted(): Promise<Core.BookmarkModelSchema[]> {
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
