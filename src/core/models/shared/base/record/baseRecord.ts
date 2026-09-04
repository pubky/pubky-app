import { Table } from 'dexie';
import { isTransientIndexedDbError } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { ModelBase } from '@/models/shared/base/baseModel';

/**
 * Base class for record-oriented models backed by a Dexie table.
 */
export abstract class RecordModelBase<Id, Schema extends { id: Id }> extends ModelBase<Id, Schema> {
  /**
   * Bulk upsert many full records at once.
   * Delegates to Dexie `bulkPut`.
   *
   * Transient IndexedDB failures (iOS Safari evicting the database under
   * storage pressure — the `UnknownError` family behind Sentry
   * PUBKY-APP-34/4E/A6/A7/…) are rethrown unchanged so callers that know how
   * to retry or degrade gracefully can do so; wrapping them here would hide
   * the cause chain from `isTransientIndexedDbError` checks at the call site.
   */
  static async bulkSave<TId, TSchema extends { id: TId }>(this: { table: Table<TSchema> }, records: TSchema[]) {
    try {
      return await this.table.bulkPut(records);
    } catch (error) {
      if (isTransientIndexedDbError(error)) {
        throw error;
      }
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, `Failed to bulk save records in ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'bulkSave',
        context: { table: this.table.name, count: records.length },
        cause: error,
      });
    }
  }
}
