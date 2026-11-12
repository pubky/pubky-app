import Dexie from 'dexie';
import { TRANSIENT_INDEXED_DB_ERROR_NAMES } from '@/database/franky/franky.constants';

type ConnectionRecovery = {
  connection: IDBDatabase;
  reopened: Promise<IDBDatabase>;
  /** Callers that joined this reconnect and have not finished their replay. */
  callers: number;
};

type RecoveryState = {
  generation: number;
  closingForRecovery: boolean;
  recovery?: ConnectionRecovery;
  failedReplayConnection?: IDBDatabase;
};

const states = new WeakMap<Dexie, RecoveryState>();
const suspensions = new WeakMap<Dexie, number>();

/** Read inside a synchronous close listener; false while the subsequent open is pending. */
export function isClosingForIndexedDbRecovery(database: Dexie): boolean {
  return states.get(database)?.closingForRecovery ?? false;
}

function getState(database: Dexie): RecoveryState {
  const existing = states.get(database);
  if (existing) return existing;
  const state: RecoveryState = { generation: 0, closingForRecovery: false };
  states.set(database, state);
  database.on('close', () => {
    // Every close outside our synchronous reconnect invalidates pending work,
    // including browser termination, deletion, version changes and a failed open.
    if (!state.closingForRecovery) invalidateIndexedDbRecovery(database);
  });
  return state;
}

function invalidateIndexedDbRecovery(database: Dexie): void {
  const state = states.get(database);
  if (!state) return;
  state.generation += 1;
  state.recovery = undefined;
  state.failedReplayConnection = undefined;
}

/** Suspend replays throughout account cleanup, including work started mid-clear. */
export function suspendIndexedDbRecovery(database: Dexie): () => void {
  invalidateIndexedDbRecovery(database);
  suspensions.set(database, (suspensions.get(database) ?? 0) + 1);
  return () => {
    const remaining = (suspensions.get(database) ?? 1) - 1;
    if (remaining) suspensions.set(database, remaining);
    else suspensions.delete(database);
  };
}

function reopen(database: Dexie, state: RecoveryState): Promise<IDBDatabase> {
  const generation = state.generation;
  const connection = database.backendDB();
  // A task boundary drains admitted transaction creation before the shared handle closes.
  // Keep resolution in Dexie promises so each caller retains its observation scope.
  return new Dexie.Promise<IDBDatabase>((resolve, reject) => {
    Dexie.asap(() => {
      try {
        if (state.generation !== generation || !database.isOpen() || database.backendDB() !== connection) {
          resolve(connection);
          return;
        }
        state.closingForRecovery = true;
        try {
          database.close({ disableAutoOpen: false });
        } finally {
          state.closingForRecovery = false;
        }
        database.open().then(() => resolve(database.backendDB()), reject);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function isRecoverableConnectionError(error: unknown): error is Error | DOMException {
  const seen = new Set<unknown>();
  let current = error;
  while (current instanceof Error || current instanceof DOMException) {
    if (seen.has(current)) return false;
    seen.add(current);
    if (current.name === 'AbortError' && 'inner' in current && current.inner != null) {
      // Dexie wraps any transaction abort, including quota and constraint errors.
      current = current.inner;
      continue;
    }
    return TRANSIENT_INDEXED_DB_ERROR_NAMES.has(current.name);
  }
  return false;
}

/**
 * Recover one failed local read, or one wholly aborted, local-only transaction.
 * Never use this around a partial write or work with external side effects. The
 * caller must replay the complete transaction so its reads and guards run again.
 *
 * One connection-transition task, with no retry timer loop or network request.
 * Dexie promises preserve each liveQuery caller's successful read observations.
 */
export async function withIndexedDbRecovery<T>(database: Dexie, operation: () => Promise<T>): Promise<T> {
  // A caller-owned transaction must fail atomically; never reopen or replay one
  // statement from it. Initial opening remains the responsibility of initialize().
  if (Dexie.currentTransaction || !database.isOpen() || suspensions.has(database)) return operation();

  const state = getState(database);
  const generation = state.generation;
  const connection = database.backendDB();
  try {
    return await operation();
  } catch (error) {
    // Structured WebKit/Dexie failure names only; schema, constraint, quota and
    // intentional DatabaseClosed errors must retain their original failure path.
    if (
      !isRecoverableConnectionError(error) ||
      state.generation !== generation ||
      state.failedReplayConnection === connection
    ) {
      throw error;
    }

    let recovery = state.recovery;
    if (recovery?.connection !== connection) {
      if (!database.isOpen() || database.backendDB() !== connection) throw error;
      // Never replace a reopened connection while a replay on it is unfinished:
      // its outcome decides whether that connection is fenced.
      if (recovery && recovery.callers > 0) throw error;
      recovery = { connection, reopened: reopen(database, state), callers: 0 };
      state.recovery = recovery;
    }
    // Joining is synchronous bookkeeping on this caller's own record, released on
    // every exit, so a later invalidation cannot miscount a newer reconnect.
    const joined = recovery;
    joined.callers += 1;
    try {
      // Await through Dexie in each caller before replaying its observed read;
      // the reconnect is shared across independent observation scopes.
      let reopened: IDBDatabase;
      try {
        reopened = await Dexie.Promise.resolve(joined.reopened);
      } catch (openError) {
        // Preserve the failed operation and retain the reconnect failure for diagnosis.
        Object.defineProperty(error, 'cause', { value: openError, configurable: true });
        throw error;
      }
      if (
        state.generation !== generation ||
        state.recovery !== joined ||
        !database.isOpen() ||
        database.backendDB() !== reopened
      ) {
        throw error;
      }
      // One replay only. Its failure is reported by the model/service as usual.
      try {
        return await operation();
      } catch (replayError) {
        if (state.generation === generation && database.isOpen() && database.backendDB() === reopened) {
          state.failedReplayConnection = reopened;
        }
        throw replayError;
      }
    } finally {
      joined.callers -= 1;
    }
  }
}
