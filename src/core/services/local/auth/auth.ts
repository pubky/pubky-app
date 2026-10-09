import { clearDatabase } from '@/database/franky/franky.helpers';
import {
  createAuthStorage,
  legacyCookieExports,
  readAuthStorage,
  readDurableAuthStorage,
  suppressAuthRestore,
} from '@/libs/auth/persistence';
import { pendingRetirements, type PersistedAuth, persistedAuthSchema } from '@/libs/auth/session.types';
import { createCanceledError, isAuthFlowCanceledError } from '@/libs/error/auth-flow-canceled';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError } from '@/libs/error/error.utils';
import {
  AUTH_MIGRATION_KEY,
  AUTH_PERSIST_KEY,
  AUTH_STORE_VERSION,
  LEGACY_AUTH_PERSIST_KEY,
  PREVIOUS_AUTH_PERSIST_KEY,
} from '@/stores/persistedKeys';

/** Durable auth reference transitions. Only opaque SDK record IDs cross into app storage. */
export class LocalAuthService {
  /** Separate from reference writes so a stalled database cannot block logout. */
  static async prepareAccount(generation: string, isCurrent: () => boolean): Promise<void> {
    const ownsPreparation = () => isCurrent() && this.read()?.generation === generation;
    try {
      if (!navigator.locks)
        throw Err.database(DatabaseErrorCode.INIT_FAILED, 'Could not prepare the saved account. Try again.', {
          service: ErrorService.Local,
          operation: 'prepareAccount',
        });
      await navigator.locks.request(`${AUTH_PERSIST_KEY}-account-preparation`, async () => {
        if (!ownsPreparation()) throw createCanceledError();
        if (!this.read()?.needsAccountPreparation) return;
        await clearDatabase(ownsPreparation);
        if (!ownsPreparation()) throw createCanceledError();
        const current = this.read();
        if (!current || current.generation !== generation) throw createCanceledError();
        await this.commit({ ...current, needsAccountPreparation: false }, generation, ownsPreparation);
      });
    } catch (error) {
      if (isAppError(error) || isAuthFlowCanceledError(error)) throw error;
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Could not prepare the saved account. Try again.', {
        service: ErrorService.Local,
        operation: 'prepareAccount',
        cause: error,
      });
    }
  }

  /** Legacy exports are public cookie metadata, used exclusively for revocation. */
  static readLegacyCookieRecords(): { key: string; raw: string; exports: string[] }[] {
    try {
      return [LEGACY_AUTH_PERSIST_KEY, PREVIOUS_AUTH_PERSIST_KEY].flatMap((key) => {
        const raw = localStorage.getItem(key);
        if (raw === null) return [];
        const exports = legacyCookieExports(key, raw);
        return exports.length ? [{ key, raw, exports }] : [];
      });
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, 'Could not read previous session metadata.', {
        service: ErrorService.Local,
        operation: 'readLegacyCookieRecords',
        cause: error,
      });
    }
  }

  static async clearLegacyCookieRecord({ key, raw }: { key: string; raw: string }): Promise<void> {
    const clear = () => {
      // Do not erase an old tab's replacement or the only copy of an unmigrated identity.
      if (
        (localStorage.getItem(AUTH_PERSIST_KEY) || localStorage.getItem(AUTH_MIGRATION_KEY)) &&
        localStorage.getItem(key) === raw
      )
        localStorage.removeItem(key);
    };
    try {
      if (navigator.locks) await navigator.locks.request(AUTH_PERSIST_KEY, clear);
      else clear();
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Could not remove previous session metadata.', {
        service: ErrorService.Local,
        operation: 'clearLegacyCookieRecord',
        cause: error,
      });
    }
  }

  static suppressRestore(generation: string): void {
    suppressAuthRestore(generation);
  }

  static read(): PersistedAuth | null {
    try {
      const raw = readAuthStorage(localStorage);
      return raw ? persistedAuthSchema.parse(JSON.parse(raw).state) : null;
    } catch (error) {
      if (isAppError(error)) throw error;
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, 'Could not read the saved session.', {
        service: ErrorService.Local,
        operation: 'readAuthReference',
        cause: error,
      });
    }
  }

  /** Remove only the completed obligation; concurrent adoptions keep their own queue. */
  static async finishRetirement(sessionStoreId: string): Promise<void> {
    const write = () => {
      const raw = readDurableAuthStorage(localStorage);
      if (!raw) return;
      const record = persistedAuthSchema.parse(JSON.parse(raw).state);
      const remaining = pendingRetirements(record).filter((ref) => ref.sessionStoreId !== sessionStoreId);
      createAuthStorage(localStorage, true).setItem(
        AUTH_PERSIST_KEY,
        JSON.stringify({
          version: AUTH_STORE_VERSION,
          state: { ...record, retiringSession: null, pendingRetirements: remaining },
        }),
      );
    };
    try {
      if (navigator.locks) await navigator.locks.request(AUTH_PERSIST_KEY, write);
      else write();
    } catch (error) {
      if (isAppError(error)) throw error;
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Could not save session cleanup. Try again.', {
        service: ErrorService.Local,
        operation: 'finishRetirement',
        cause: error,
      });
    }
  }

  static async commit(
    record: PersistedAuth,
    expectedGeneration: string,
    isCurrent: () => boolean = () => true,
  ): Promise<void> {
    const write = () => {
      if (!isCurrent()) throw createCanceledError();
      let currentGeneration: string;
      let current: PersistedAuth | null = null;
      try {
        const raw = readDurableAuthStorage(localStorage);
        current = raw ? persistedAuthSchema.parse(JSON.parse(raw).state) : null;
        currentGeneration = current?.generation ?? '';
        if (current && record.sessionReference) {
          if (
            current.sessionReference?.sessionStoreId !== record.sessionReference.sessionStoreId &&
            pendingRetirements(current).some((ref) => ref.sessionStoreId === record.sessionReference?.sessionStoreId)
          )
            throw createCanceledError();
        }
      } catch (error) {
        // Explicit logout may replace a corrupt local reference with a signed-out tombstone.
        if (record.sessionReference !== null || record.currentUserPubky !== null) throw error;
        currentGeneration = expectedGeneration;
      }
      if (currentGeneration !== expectedGeneration) throw createCanceledError();
      // A tab-only logout masks credentials in memory. Use the unmasked durable record
      // so its later login cannot forget outstanding revocations or the displaced grant.
      const retirements = pendingRetirements({
        retiringSession: current?.sessionReference,
        // A completed retirement must not be resurrected from the caller's pre-lock snapshot.
        pendingRetirements: pendingRetirements(current ?? record),
      }).filter((ref) => ref.grantId !== record.sessionReference?.grantId);
      const next = { ...record, retiringSession: null, pendingRetirements: retirements };
      createAuthStorage(localStorage, true).setItem(
        AUTH_PERSIST_KEY,
        JSON.stringify({ state: next, version: AUTH_STORE_VERSION }),
      );
    };
    try {
      if (navigator.locks) await navigator.locks.request(AUTH_PERSIST_KEY, write);
      else if (record.sessionReference === null)
        write(); // Explicit logout must remain available.
      else
        throw Err.database(
          DatabaseErrorCode.INIT_FAILED,
          'This browser cannot safely save a new session. Try an updated browser.',
          {
            service: ErrorService.Local,
            operation: 'commitAuthReference',
          },
        );
    } catch (error) {
      if (isAppError(error) || isAuthFlowCanceledError(error)) throw error;
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Could not save the authenticated session.', {
        service: ErrorService.Local,
        operation: 'commitAuthReference',
        cause: error,
      });
    }
  }
}
