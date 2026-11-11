import Dexie from 'dexie';

type ConnectionRecovery = {
  connection: IDBDatabase;
  reopened: Promise<IDBDatabase>;
};

type RecoveryState = {
  generation: number;
  closingForRecovery: boolean;
  recovery?: ConnectionRecovery;
};

const states = new WeakMap<Dexie, RecoveryState>();
const suspensions = new WeakMap<Dexie, number>();

function getState(database: Dexie): RecoveryState {
  const existing = states.get(database);
  if (existing) return existing;
  const state: RecoveryState = { generation: 0, closingForRecovery: false };
  states.set(database, state);
  database.on('close', () => {
    // Our reconnect keeps this operation alive. An explicit close, version change,
    // or deletion instead invalidates it, even if another caller opens the DB again.
    if (!state.closingForRecovery) invalidateIndexedDbRecovery(database);
  });
  return state;
}

function invalidateIndexedDbRecovery(database: Dexie): void {
  const state = states.get(database);
  if (!state) return;
  state.generation += 1;
  state.recovery = undefined;
}

/** Suspend replays throughout account cleanup, including work started mid-clear. */
export function suspendIndexedDbRecovery(database: Dexie): () => void {
  invalidateIndexedDbRecovery(database);
  suspensions.set(database, (suspensions.get(database) ?? 0) + 1);
  return () => {
    invalidateIndexedDbRecovery(database);
    const remaining = (suspensions.get(database) ?? 1) - 1;
    if (remaining) suspensions.set(database, remaining);
    else suspensions.delete(database);
  };
}

async function reopen(database: Dexie, state: RecoveryState): Promise<IDBDatabase> {
  state.closingForRecovery = true;
  try {
    database.close({ disableAutoOpen: false });
  } finally {
    state.closingForRecovery = false;
  }
  await database.open();
  return database.backendDB();
}

/**
 * Recover one failed local read, or one wholly aborted, local-only transaction.
 * Never use this around a partial write or work with external side effects. The
 * caller must replay the complete transaction so its reads and guards run again.
 *
 * There are no timers or network retries. Reconnection stays in the calling
 * promise chain so liveQuery retains the successful read's observations.
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
      !(error instanceof Error || error instanceof DOMException) ||
      !['UnknownError', 'AbortError'].includes(error.name) ||
      state.generation !== generation
    ) {
      throw error;
    }

    let recovery = state.recovery;
    if (recovery?.connection !== connection) {
      if (!database.isOpen() || database.backendDB() !== connection) throw error;
      recovery = { connection, reopened: reopen(database, state) };
      state.recovery = recovery;
    }
    const reopened = await recovery.reopened;
    if (
      state.generation !== generation ||
      state.recovery !== recovery ||
      !database.isOpen() ||
      database.backendDB() !== reopened
    ) {
      throw error;
    }
    // One replay only. Its failure is reported by the model/service as usual.
    return operation();
  }
}
