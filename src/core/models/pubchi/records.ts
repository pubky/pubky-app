import Dexie from 'dexie';
import {
  clearPubchiOwnerData,
  deletePubchiDatabase,
  getPubchiDatabase,
  getPubchiDeviceSignersForCleanup,
  subscribePubchiDatabaseBlocked,
} from '@/database/pubchi/pubchi';
import { isAppError } from '@/libs/error/error';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { PubchiDraftPostRecord } from '@/models/pubchi/draft-post.schema';
import type { PubchiTagApplicationRecord } from '@/models/pubchi/tag-application.schema';

async function query<T>(
  operation: string,
  work: () => Promise<T>,
  code = DatabaseErrorCode.QUERY_FAILED,
  signal?: AbortSignal,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isAppError(error)) throw error;
    // Dexie wraps a guard's DOMException in DexieError; preserve only this caller's cancellation reason.
    if (
      signal?.aborted &&
      (error === signal.reason || (error instanceof Dexie.DexieError && error.inner === signal.reason))
    ) {
      throw signal.reason;
    }
    throw Err.database(code, 'Failed to access Pubchi records', {
      service: ErrorService.Pubchi,
      operation,
      cause: error,
    });
  }
}

export class PubchiRecordModel {
  protected constructor() {}

  static getDeviceSignersForCleanup(owner: string) {
    return query('getDeviceSignersForCleanup', () => getPubchiDeviceSignersForCleanup(owner));
  }

  static subscribeDatabaseBlocked(listener: (blocked: boolean) => void) {
    return subscribePubchiDatabaseBlocked(listener);
  }

  static clearOwnerData(owner: string, isCurrent: () => boolean = () => true): Promise<void> {
    return query('clearOwnerData', () => clearPubchiOwnerData(owner, isCurrent), DatabaseErrorCode.DELETE_FAILED);
  }

  static deleteLocalDatabase(): Promise<void> {
    return query('deleteLocalDatabase', () => deletePubchiDatabase(), DatabaseErrorCode.DELETE_FAILED);
  }

  static getTagApplication(id: string) {
    return query('getTagApplication', () => getPubchiDatabase().tagApplications.get(id));
  }

  static updateTagApplication(id: string, changes: Partial<PubchiTagApplicationRecord>) {
    return query(
      'updateTagApplication',
      () => getPubchiDatabase().tagApplications.update(id, changes),
      DatabaseErrorCode.WRITE_FAILED,
    );
  }

  static putTagApplication(record: PubchiTagApplicationRecord, assertCurrent: () => void, signal?: AbortSignal) {
    return query(
      'putTagApplication',
      () => {
        const db = getPubchiDatabase();
        return db.transaction('rw', db.tagApplications, async () => {
          assertCurrent();
          const id = await db.tagApplications.put(record);
          // The native transaction may have queued behind logout cleanup. Throwing here
          // aborts the write if the generation changed while IndexedDB was waiting.
          assertCurrent();
          return id;
        });
      },
      DatabaseErrorCode.TRANSACTION_FAILED,
      signal,
    );
  }

  static getDraftPost(id: string) {
    return query('getDraftPost', () => getPubchiDatabase().draftPosts.get(id));
  }

  static updateDraftPost(id: string, changes: Partial<PubchiDraftPostRecord>) {
    return query(
      'updateDraftPost',
      () => getPubchiDatabase().draftPosts.update(id, changes),
      DatabaseErrorCode.WRITE_FAILED,
    );
  }

  static putDraftPost(record: PubchiDraftPostRecord, assertCurrent: () => void, signal?: AbortSignal) {
    return query(
      'putDraftPost',
      () => {
        const db = getPubchiDatabase();
        return db.transaction('rw', db.draftPosts, async () => {
          assertCurrent();
          const id = await db.draftPosts.put(record);
          // The native transaction may have queued behind logout cleanup. Throwing here
          // aborts the write if the generation changed while IndexedDB was waiting.
          assertCurrent();
          return id;
        });
      },
      DatabaseErrorCode.TRANSACTION_FAILED,
      signal,
    );
  }
}
