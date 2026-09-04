import { Table } from 'dexie';
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
   * Failures are always wrapped with `Err.database(WRITE_FAILED, …)`, keeping
   * the original IndexedDB error on `cause` so `isTransientIndexedDbError`
   * (used by the database init retry path in `franky.ts`) can still classify
   * them through the cause chain if they ever escape this layer.
   */
  static async bulkSave<TId, TSchema extends { id: TId }>(this: { table: Table<TSchema> }, records: TSchema[]) {
    try {
      return await this.table.bulkPut(records);
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, `Failed to bulk save records in ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'bulkSave',
        context: { table: this.table.name, count: records.length },
        cause: error,
      });
    }
  }
}
