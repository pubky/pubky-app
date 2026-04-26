import { Table } from 'dexie';
import { NexusModelTuple } from './baseTuple.type';
import { ModelBase } from '@/core/models/shared/base/baseModel';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

/**
 * Base class for tuple-oriented models, where bulk operations accept tuples [id, data].
 */
export abstract class TupleModelBase<Id, Schema extends { id: Id }> extends ModelBase<Id, Schema> {
  /**
   * Bulk upsert many tuples at once by converting them with `toSchema` and delegating to Dexie `bulkPut`.
   */
  static async bulkSave<TId, TTupleData extends object, TSchema extends { id: TId }>(
    this: { table: Table<TSchema>; toSchema(tuple: NexusModelTuple<TTupleData>): TSchema },
    records: NexusModelTuple<TTupleData>[],
  ) {
    try {
      const toSave = records.map((tuple) => this.toSchema(tuple));
      return await this.table.bulkPut(toSave);
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
