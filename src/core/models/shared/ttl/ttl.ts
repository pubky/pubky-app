import { Table } from 'dexie';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { ModelBase } from '@/models/shared/base/baseModel';
import type { NexusModelTuple } from '@/models/shared/base/tuple/baseTuple.type';
import type { TtlModelSchema } from '@/models/shared/ttl/ttl.schema';
// Each domain row will have its own TTL row. e.g. UserTtlModel, PostTtlModel, etc.
export abstract class Ttl<Id, Schema extends TtlModelSchema<Id>> extends ModelBase<Id, Schema> {
  lastUpdatedAt: number;

  constructor(data: Schema) {
    super(data);
    this.lastUpdatedAt = data.lastUpdatedAt;
  }

  static async bulkSave<TId, TSchema extends TtlModelSchema<TId>>(
    this: { table: Table<TSchema> },
    records: NexusModelTuple<Pick<TSchema, 'lastUpdatedAt'>>[],
  ) {
    try {
      const toSave = records.map((tuple) => ({ id: tuple[0] as TId, ...tuple[1] }) as TSchema);
      return await this.table.bulkPut(toSave);
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, `Failed to bulk save TTL in ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'bulkSave',
        context: { table: this.table.name, count: records.length },
        cause: error,
      });
    }
  }
}
