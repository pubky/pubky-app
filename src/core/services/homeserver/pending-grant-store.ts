import { z } from 'zod';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

export const PENDING_GRANT_RESUME_WINDOW_MS = 3 * 60_000;
const DATABASE = 'pubky-app-pending-grants-v1';
const STORE = 'pending';
const REJECTED_PREFIX = 'pubky-app-rejected-grant-v1:';
const schema = z.object({
  id: z.uuid(),
  context: z.string().min(1),
  createdAt: z.number().finite().nonnegative(),
  mode: z.literal('delegated'),
  saved: z.string().min(1),
});
export type PendingGrantRecord = z.infer<typeof schema>;

export interface PendingGrantLease {
  readonly active: boolean;
  read(legacy?: PendingGrantRecord): Promise<PendingGrantRecord | null>;
  save(record: PendingGrantRecord): Promise<void>;
  remove(): Promise<void>;
  release(): void;
}

// SDK serialization can contain credentials. Do not attach the record, original
// storage exception, or context to errors that the Err factory sends to telemetry.
function storageError(code: DatabaseErrorCode) {
  return Err.database(code, 'Could not access the pending sign-in. Try again.', {
    service: ErrorService.Homeserver,
    operation: 'pendingGrantStore',
  });
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let failed = false;
    try {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
      request.onerror = request.onblocked = () => {
        failed = true;
        reject(storageError(DatabaseErrorCode.INIT_FAILED));
      };
      request.onsuccess = () => {
        if (failed) request.result.close();
        else resolve(request.result);
      };
    } catch {
      reject(storageError(DatabaseErrorCode.INIT_FAILED));
    }
  });
}

async function transaction<T>(
  code: DatabaseErrorCode,
  run: (store: IDBObjectStore, result: (value: T) => void) => void,
): Promise<T> {
  const database = await open();
  return new Promise((resolve, reject) => {
    let result: T;
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(STORE, 'readwrite');
      transaction.oncomplete = () => {
        database.close();
        resolve(result);
      };
      transaction.onabort = () => {
        database.close();
        reject(storageError(code));
      };
      run(transaction.objectStore(STORE), (value) => {
        result = value;
      });
    } catch {
      database.close();
      reject(storageError(code));
    }
  });
}

function isRejected(id: string): boolean {
  const stored = localStorage.getItem(`${REJECTED_PREFIX}${id}`);
  if (stored === null) return false;
  const expiresAt = Number(stored);
  // A malformed marker must never make a canceled authorization resumable.
  return !Number.isFinite(expiresAt) || expiresAt > Date.now();
}

function validRecord(value: unknown): PendingGrantRecord | null {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return null;
  const record = parsed.data;
  const age = Date.now() - record.createdAt;
  return age >= 0 && age < PENDING_GRANT_RESUME_WINDOW_MS && !isRejected(record.id) ? record : null;
}

export class PendingGrantStore {
  static async getCandidates(context: string, preferredId?: string): Promise<PendingGrantRecord[]> {
    try {
      // Markers contain only random attempt IDs and expiry times, never grant data.
      // Keep them after a failed delete, but discard expired markers on the next read.
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(REJECTED_PREFIX) && Number(localStorage.getItem(key)) <= Date.now()) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      throw storageError(DatabaseErrorCode.QUERY_FAILED);
    }
    return transaction(DatabaseErrorCode.QUERY_FAILED, (store, result) => {
      const candidates: PendingGrantRecord[] = [];
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        if (!cursor.result) {
          result(
            candidates.sort(
              (a, b) => Number(b.id === preferredId) - Number(a.id === preferredId) || b.createdAt - a.createdAt,
            ),
          );
          return;
        }
        try {
          const record = validRecord(cursor.result.value);
          if (!record) cursor.result.delete();
          else if (record.context === context) candidates.push(record);
          cursor.result.continue();
        } catch {
          store.transaction.abort();
        }
      };
    });
  }

  /** A tab owns the attempt for the lifetime of its Web Lock, including SDK adoption. */
  static claim(id: string): Promise<PendingGrantLease | null> {
    return new Promise((resolve, reject) => {
      try {
        void navigator.locks
          .request(`pubky-app-pending-grant:${id}`, { ifAvailable: true }, async (lock) => {
            if (!lock) {
              resolve(null);
              return;
            }
            let active = true;
            let removing = false;
            let removalSafe = true;
            let releaseRequested = false;
            let operations = 0;
            let queue: Promise<unknown> = Promise.resolve();
            let unlock!: () => void;
            const released = new Promise<void>((done) => {
              unlock = done;
            });
            const release = () => {
              releaseRequested = true;
              if (operations === 0 && removalSafe) {
                active = false;
                unlock();
              }
            };
            const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
              operations++;
              const pending = queue.then(operation);
              queue = pending.catch(() => {});
              return pending.finally(() => {
                operations--;
                if (releaseRequested) release();
              });
            };
            const lease: PendingGrantLease = {
              get active() {
                return active;
              },
              read(legacy) {
                return enqueue(async () => {
                  if (!active || removing) return null;
                  return transaction(DatabaseErrorCode.QUERY_FAILED, (store, result) => {
                    const request = store.get(id);
                    request.onsuccess = () => {
                      try {
                        // Only import a pre-upgrade tab record when no durable record exists.
                        // Rejected, expired or malformed durable data must never fall back.
                        const value = request.result === undefined && legacy?.id === id ? legacy : request.result;
                        const record = validRecord(value);
                        if (!record && request.result !== undefined) store.delete(id);
                        result(record);
                      } catch {
                        store.transaction.abort();
                      }
                    };
                  });
                });
              },
              save(record) {
                return enqueue(async () => {
                  if (!active || removing || record.id !== id || !schema.safeParse(record).success) {
                    throw storageError(DatabaseErrorCode.WRITE_FAILED);
                  }
                  return transaction(DatabaseErrorCode.WRITE_FAILED, (store, result) => {
                    // Recheck after opening IndexedDB: cancel can run during the await.
                    if (!active || removing || !validRecord(record)) {
                      store.transaction.abort();
                      return;
                    }
                    store.put(record);
                    result(undefined);
                  });
                });
              },
              remove() {
                if (!active) return Promise.resolve();
                removing = true;
                removalSafe = false;
                let markerFailed = false;
                try {
                  // This executes synchronously, before IndexedDB work. A process
                  // exit during deletion cannot resurrect the canceled attempt.
                  localStorage.setItem(`${REJECTED_PREFIX}${id}`, String(Date.now() + PENDING_GRANT_RESUME_WINDOW_MS));
                  removalSafe = true;
                } catch {
                  markerFailed = true;
                }
                return enqueue(async () => {
                  await transaction<void>(DatabaseErrorCode.DELETE_FAILED, (store, result) => {
                    store.delete(id);
                    result(undefined);
                  });
                  removalSafe = true;
                  if (markerFailed) throw storageError(DatabaseErrorCode.DELETE_FAILED);
                });
              },
              release,
            };
            resolve(lease);
            await released;
          })
          .catch(() => reject(storageError(DatabaseErrorCode.INIT_FAILED)));
      } catch {
        reject(storageError(DatabaseErrorCode.INIT_FAILED));
      }
    });
  }
}
