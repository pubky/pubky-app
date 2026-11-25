import { getPubchiDatabase } from '@/database/pubchi/pubchi';
import { isAppError } from '@/libs/error/error';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { bindingRecordId, type PubchiBindingRecord } from '@/models/pubchi/binding.schema';

export class PubchiBindingModel {
  protected constructor() {}

  static async upsert(
    record: PubchiBindingRecord,
    assertCurrent: () => void = () => undefined,
  ): Promise<PubchiBindingRecord> {
    try {
      const db = getPubchiDatabase();
      await db.transaction('rw', db.bindings, async () => {
        assertCurrent();
        await db.bindings.put(record);
        assertCurrent();
      });
      return record;
    } catch (error) {
      if (isAppError(error)) throw error;
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to persist Pubchi binding', {
        service: ErrorService.Pubchi,
        operation: 'upsert',
        cause: error,
      });
    }
  }

  static async readActive(owner: string): Promise<PubchiBindingRecord | undefined> {
    try {
      const db = getPubchiDatabase();
      const matches = await db.bindings.where('owner').equals(owner).toArray();
      const active = matches.filter((row) => row.status === 'active');
      if (active.length > 1) {
        throw Err.database(DatabaseErrorCode.INTEGRITY_ERROR, 'Multiple active Pubchi bindings found', {
          service: ErrorService.Pubchi,
          operation: 'readActive',
        });
      }
      return active[0];
    } catch (error) {
      if (isAppError(error)) throw error;
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, 'Failed to read Pubchi binding', {
        service: ErrorService.Pubchi,
        operation: 'readActive',
        cause: error,
      });
    }
  }

  static async replaceActive(
    record: PubchiBindingRecord,
    assertCurrent: () => void = () => undefined,
  ): Promise<PubchiBindingRecord> {
    try {
      const db = getPubchiDatabase();
      await db.transaction('rw', db.bindings, async () => {
        assertCurrent();
        const matches = await db.bindings.where('owner').equals(record.owner).toArray();
        assertCurrent();
        await Promise.all(
          matches
            .filter((row) => row.status === 'active' && row.id !== record.id)
            .map((row) => db.bindings.put({ ...row, status: 'revoked', updated_at: record.updated_at })),
        );
        await db.bindings.put(record);
        assertCurrent();
      });
      return record;
    } catch (error) {
      if (isAppError(error)) throw error;
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to replace active Pubchi binding', {
        service: ErrorService.Pubchi,
        operation: 'replaceActive',
        cause: error,
      });
    }
  }

  static async read(owner: string, bot: string): Promise<PubchiBindingRecord | undefined> {
    try {
      const db = getPubchiDatabase();
      return await db.bindings.get(bindingRecordId(owner, bot));
    } catch (error) {
      if (isAppError(error)) throw error;
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, 'Failed to read Pubchi binding', {
        service: ErrorService.Pubchi,
        operation: 'read',
        cause: error,
      });
    }
  }

  static async delete(owner: string, bot: string): Promise<void> {
    try {
      const db = getPubchiDatabase();
      await db.bindings.delete(bindingRecordId(owner, bot));
    } catch (error) {
      if (isAppError(error)) throw error;
      throw Err.database(DatabaseErrorCode.DELETE_FAILED, 'Failed to delete Pubchi binding', {
        service: ErrorService.Pubchi,
        operation: 'delete',
        cause: error,
      });
    }
  }

  static async deleteNotOwnedBy(owner: string): Promise<number> {
    try {
      const db = getPubchiDatabase();
      const foreign = (await db.bindings.toArray()).filter((row) => row.owner !== owner);
      await Promise.all(foreign.map((row) => db.bindings.delete(row.id)));
      return foreign.length;
    } catch (error) {
      if (isAppError(error)) throw error;
      throw Err.database(DatabaseErrorCode.DELETE_FAILED, 'Failed to delete foreign Pubchi bindings', {
        service: ErrorService.Pubchi,
        operation: 'deleteNotOwnedBy',
        cause: error,
      });
    }
  }
}
