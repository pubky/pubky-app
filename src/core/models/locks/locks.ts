import { Table } from 'dexie';
import { db } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { LockModelSchema } from '@/models/locks/locks.schema';
import { RecordModelBase } from '@/models/shared/base/record/baseRecord';

export class LockModel extends RecordModelBase<string, LockModelSchema> implements LockModelSchema {
  static table: Table<LockModelSchema> = db.table('locks');

  creator: string;
  descriptor?: LockModelSchema['descriptor'];
  post?: LockModelSchema['post'];
  unlockedAt?: number;

  constructor(record: LockModelSchema) {
    super(record);
    this.creator = record.creator;
    this.descriptor = record.descriptor;
    this.post = record.post;
    this.unlockedAt = record.unlockedAt;
  }

  static async findAllUnlocked(): Promise<LockModelSchema[]> {
    try {
      return await this.table.where('unlockedAt').aboveOrEqual(0).reverse().toArray();
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, 'Failed to query unlocked locks', {
        service: ErrorService.Local,
        operation: 'findAllUnlocked',
        context: { table: this.table.name },
        cause: error,
      });
    }
  }
}
