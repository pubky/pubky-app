import { createCanceledError } from '@/libs/auth/cancellation';
import { createAuthStorage } from '@/libs/auth/persistence';
import { type PersistedAuth, persistedAuthSchema } from '@/libs/auth/session.types';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError } from '@/libs/error/error.utils';
import { AUTH_PERSIST_KEY } from '@/stores/persistedKeys';

/** Durable auth reference transitions. Only opaque SDK record IDs cross into app storage. */
export class LocalAuthService {
  static read(): PersistedAuth | null {
    try {
      const raw = createAuthStorage(localStorage).getItem(AUTH_PERSIST_KEY);
      return raw ? persistedAuthSchema.parse(JSON.parse(raw).state) : null;
    } catch (error) {
      if (isAppError(error)) throw error;
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, 'Could not read the saved session.', {
        service: ErrorService.Local,
        operation: 'readAuthReference',
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
      try {
        currentGeneration = this.read()?.generation ?? '';
      } catch (error) {
        // Explicit logout may replace a corrupt local reference with a signed-out tombstone.
        if (record.sessionReference !== null || record.currentUserPubky !== null) throw error;
        currentGeneration = expectedGeneration;
      }
      if (currentGeneration !== expectedGeneration) throw createCanceledError();
      createAuthStorage(localStorage, true).setItem(AUTH_PERSIST_KEY, JSON.stringify({ state: record, version: 2 }));
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
      if (isAppError(error) || (error instanceof Error && error.name === 'AuthFlowCanceled')) throw error;
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Could not save the authenticated session.', {
        service: ErrorService.Local,
        operation: 'commitAuthReference',
      });
    }
  }
}
