import Dexie from 'dexie';
import { forceCloseDatabase, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DB_CLOSE_RECHECK_DELAYS_MS, DB_INIT_MAX_ATTEMPTS, DB_NAME, DB_VERSION } from '@/config/database';
import { AppDatabase, isTransientIndexedDbError } from '@/database/franky/franky';
import { Logger } from '@/libs/logger/logger';
import { deleteNativeDatabase, openOtherBuildDatabase } from '@/test-utils/indexed-db';
import { asOpaque } from '@/test-utils/type-assertions';

const transientError = (name: string, message = '') => Object.assign(new Error(message), { name });

// Test-only view onto the private members exercised by the version-probe regression tests.
type InternalAppDatabase = {
  getExistingDbVersion: () => Promise<number | null>;
  recreateDatabase: (currentVersion: number | null, rawVersion?: number | null) => Promise<void>;
};

// What another tab's delete does to this page's connection: Dexie's `versionchange` subscribers run and it closes.
const closeFromOtherConnection = (database: AppDatabase) => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  database
    .on('versionchange')
    .fire(new IDBVersionChangeEvent('versionchange', { oldVersion: DB_VERSION * 10, newVersion: null }));
};

const openNativeDatabase = async (
  name: string,
  options: { version?: number; upgrade?: (database: IDBDatabase) => void } = {},
) => {
  await new Promise<void>((resolve, reject) => {
    const request = options.version ? indexedDB.open(name, options.version) : indexedDB.open(name);

    request.onupgradeneeded = () => {
      options.upgrade?.(request.result);
    };

    request.onsuccess = () => {
      request.result.close();
      resolve();
    };

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open native database'));
    };
  });
};

const readNativeDatabaseVersion = async (name: string) =>
  new Promise<number>((resolve, reject) => {
    const request = indexedDB.open(name);

    request.onsuccess = () => {
      const { version } = request.result;
      request.result.close();
      resolve(typeof version === 'number' ? version : NaN);
    };

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to read native database version'));
    };
  });

const readNativeObjectStoreNames = async (name: string) =>
  new Promise<string[]>((resolve, reject) => {
    const request = indexedDB.open(name);

    request.onsuccess = () => {
      const { objectStoreNames } = request.result;
      const names = Array.from({ length: objectStoreNames.length }, (_, index) => objectStoreNames.item(index) ?? '');
      request.result.close();
      resolve(names);
    };

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to read native object stores'));
    };
  });

describe('Database Initialization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('prevents the manual version mismatch reproduction steps from persisting', async () => {
    const reproductionDbName = `${DB_NAME}-manual-mismatch-test`;
    const reproductionDb = new AppDatabase(reproductionDbName);

    await deleteNativeDatabase(reproductionDbName, () => reproductionDb.close());

    const loggerInfoSpy = vi.spyOn(Logger, 'info');

    // Step 1 & 2 from the reproduction: sign in and observe the current version.
    await reproductionDb.initialize();
    const baselineVersion = await readNativeDatabaseVersion(reproductionDbName);
    expect(baselineVersion).toBeGreaterThan(0);

    // Step 3: delete an entry by creating and then removing a record.
    await reproductionDb.transaction('rw', reproductionDb.user_counts, async () => {
      const insertedId = await reproductionDb.user_counts.put({
        id: 'repro-user',
        tagged: 0,
        tags: 0,
        unique_tags: 0,
        posts: 0,
        replies: 0,
        following: 0,
        followers: 0,
        friends: 0,
        collections: 0,
        bookmarks: 0,
      });

      await reproductionDb.user_counts.delete(insertedId);
    });

    // Step 4: sign out closes Dexie connections.
    reproductionDb.close();

    // Step 5: manually open the database with a different version and legacy store.
    const mismatchedVersion = baselineVersion + 68;
    await openNativeDatabase(reproductionDbName, {
      version: mismatchedVersion,
      upgrade: (nativeDb) => {
        if (!nativeDb.objectStoreNames.contains('legacy_store')) {
          nativeDb
            .createObjectStore('legacy_store', { keyPath: 'id', autoIncrement: true })
            .add({ value: 'legacy-record' });
        }
      },
    });

    const injectedVersion = await readNativeDatabaseVersion(reproductionDbName);
    expect(injectedVersion).toBe(mismatchedVersion);

    // Step 6: signing in again should detect and recover from the mismatch.
    await reproductionDb.initialize();

    const mismatchLog = loggerInfoSpy.mock.calls.find(
      ([message]) => typeof message === 'string' && message.startsWith('Database version mismatch'),
    );

    // The normalized version will be injectedVersion / 10
    const normalizedVersion = injectedVersion / 10;
    expect(mismatchLog?.[0]).toBe(`Database version mismatch. Current: ${normalizedVersion}, Expected: ${DB_VERSION}`);

    expect(reproductionDb.verno).toBe(DB_VERSION);

    const storeNames = await readNativeObjectStoreNames(reproductionDbName);
    expect(storeNames).not.toContain('legacy_store');

    const restoredNativeVersion = await readNativeDatabaseVersion(reproductionDbName);
    expect(restoredNativeVersion).toBe(baselineVersion);

    loggerInfoSpy.mockRestore();
    await reproductionDb.delete();
  });

  it('handles DB_VERSION that is a multiple of 10 correctly', async () => {
    const testDbName = `${DB_NAME}-version-multiple-of-10`;
    const testDb = new AppDatabase(testDbName);

    await deleteNativeDatabase(testDbName, () => testDb.close());

    const loggerInfoSpy = vi.spyOn(Logger, 'info');

    try {
      // Initialize the database normally
      await testDb.initialize();

      const storedVersion = await readNativeDatabaseVersion(testDbName);

      // Dexie multiplies the version by 10 internally
      expect(storedVersion).toBe(DB_VERSION * 10);

      // Now simulate a scenario where DB_VERSION is 10
      // by manually setting a database with version 100 (10 * 10)
      testDb.close();
      await openNativeDatabase(testDbName, {
        version: 100,
        upgrade: (nativeDb) => {
          // Create a dummy store if needed
          if (!nativeDb.objectStoreNames.contains('test_store')) {
            nativeDb.createObjectStore('test_store', { keyPath: 'id' });
          }
        },
      });

      const version100 = await readNativeDatabaseVersion(testDbName);
      expect(version100).toBe(100);

      // Now verify normalization: 100 / 10 = 10
      // If DB_VERSION is not 10, this should trigger a mismatch and recreate
      await testDb.initialize();

      // If DB_VERSION is 10, no mismatch. If it's not 10, mismatch is detected
      if (DB_VERSION === 10) {
        // Should not have logged a mismatch
        const mismatchLog = loggerInfoSpy.mock.calls.find(
          ([message]) => typeof message === 'string' && message.startsWith('Database version mismatch'),
        );
        expect(mismatchLog).toBeUndefined();
      } else {
        // Should have logged a mismatch (normalized 100 -> 10, but DB_VERSION is different)
        const mismatchLog = loggerInfoSpy.mock.calls.find(
          ([message]) => typeof message === 'string' && message.startsWith('Database version mismatch'),
        );
        expect(mismatchLog?.[0]).toBe(`Database version mismatch. Current: 10, Expected: ${DB_VERSION}`);
      }
    } finally {
      loggerInfoSpy.mockRestore();
      await testDb.delete();
    }
  });

  it('returns wasDbReset true after recreateDatabase runs (version mismatch)', async () => {
    const testDbName = `${DB_NAME}-wasDbReset-recreate`;
    const testDb = new AppDatabase(testDbName);

    await deleteNativeDatabase(testDbName, () => testDb.close());

    // Initialize normally first
    const firstResult = await testDb.initialize();
    expect(firstResult.wasDbReset).toBe(true); // new DB

    // Create version mismatch
    testDb.close();
    const baselineVersion = await readNativeDatabaseVersion(testDbName);
    const mismatchedVersion = baselineVersion + 10;
    await openNativeDatabase(testDbName, {
      version: mismatchedVersion,
      upgrade: (nativeDb) => {
        if (!nativeDb.objectStoreNames.contains('test_store')) {
          nativeDb.createObjectStore('test_store', { keyPath: 'id' });
        }
      },
    });

    // Re-initialize — should detect mismatch and recreate
    const result = await testDb.initialize();
    expect(result.wasDbReset).toBe(true);

    // Clean up test database to avoid leaking into other tests
    await testDb.delete();
  });

  it('returns wasDbReset true when initialize creates a new database', async () => {
    const testDbName = `${DB_NAME}-wasDbReset-new`;
    const testDb = new AppDatabase(testDbName);

    await deleteNativeDatabase(testDbName, () => testDb.close());

    const result = await testDb.initialize();

    expect(result.wasDbReset).toBe(true);

    // Clean up test database to avoid leaking into other tests
    await testDb.delete();
  });

  it('gracefully handles unavailable indexedDB', async () => {
    const testDbName = `${DB_NAME}-no-indexeddb`;
    const testDb = new AppDatabase(testDbName);

    const loggerWarnSpy = vi.spyOn(Logger, 'warn');

    // Mock indexedDB as undefined to simulate environments where it's not available
    const originalIndexedDB = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    try {
      // Should initialize without errors and log a warning
      await testDb.initialize();

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'IndexedDB is not available in this environment. Skipping database initialization.',
      );

      // Database operations should not throw errors
      expect(testDb.isOpen()).toBe(false);
    } finally {
      // Restore indexedDB
      Object.defineProperty(globalThis, 'indexedDB', {
        value: originalIndexedDB,
        writable: true,
        configurable: true,
      });
      loggerWarnSpy.mockRestore();
    }
  });

  it('retries and recovers from a transient IndexedDB error during initialization', async () => {
    const testDbName = `${DB_NAME}-transient-recover`;
    const testDb = new AppDatabase(testDbName);

    await deleteNativeDatabase(testDbName, () => testDb.close());

    const loggerWarnSpy = vi.spyOn(Logger, 'warn');
    const existsSpy = vi.spyOn(Dexie, 'exists');
    // First attempt: WebKit drops the connection. Subsequent attempts: behave as a new DB.
    existsSpy.mockRejectedValueOnce(transientError('UnknownError', 'Connection to Indexed Database server lost'));
    existsSpy.mockResolvedValue(false);

    try {
      const result = await testDb.initialize();

      expect(result.wasDbReset).toBe(true);
      expect(existsSpy).toHaveBeenCalledTimes(2);
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'Transient IndexedDB error during initialization. Retrying...',
        expect.objectContaining({ attempt: 1 }),
      );
      expect(testDb.isOpen()).toBe(true);
    } finally {
      existsSpy.mockRestore();
      loggerWarnSpy.mockRestore();
      await testDb.delete();
    }
  });

  it('gives up after the maximum attempts when the transient error persists', async () => {
    const testDbName = `${DB_NAME}-transient-persist`;
    const testDb = new AppDatabase(testDbName);

    const existsSpy = vi.spyOn(Dexie, 'exists');
    existsSpy.mockRejectedValue(transientError('UnknownError', 'Database deleted by request of the user'));

    try {
      await expect(testDb.initialize()).rejects.toMatchObject({
        name: 'AppError',
        code: 'INIT_FAILED',
      });
      expect(existsSpy).toHaveBeenCalledTimes(DB_INIT_MAX_ATTEMPTS);
    } finally {
      existsSpy.mockRestore();
    }
  });

  it('does not retry on a non-transient initialization error', async () => {
    const testDbName = `${DB_NAME}-non-transient`;
    const testDb = new AppDatabase(testDbName);

    const existsSpy = vi.spyOn(Dexie, 'exists');
    existsSpy.mockRejectedValue(new TypeError('boom'));

    try {
      await expect(testDb.initialize()).rejects.toMatchObject({
        name: 'AppError',
        code: 'INIT_FAILED',
      });
      // No retries for deterministic failures.
      expect(existsSpy).toHaveBeenCalledTimes(1);
    } finally {
      existsSpy.mockRestore();
    }
  });

  it('retries instead of recreating when the version probe fails transiently', async () => {
    const testDb = new AppDatabase(`${DB_NAME}-probe-transient-recover`);
    const internal = asOpaque<InternalAppDatabase>(testDb);

    const existsSpy = vi.spyOn(Dexie, 'exists').mockResolvedValue(true);
    const recreateSpy = vi.spyOn(internal, 'recreateDatabase');
    const versionSpy = vi.spyOn(internal, 'getExistingDbVersion');
    // First probe is dropped by WebKit, second probe reports the current version.
    versionSpy
      .mockRejectedValueOnce(transientError('UnknownError', 'Connection to Indexed Database server lost'))
      .mockResolvedValueOnce(DB_VERSION * 10);

    try {
      const result = await testDb.initialize();

      expect(result.wasDbReset).toBe(false);
      expect(versionSpy).toHaveBeenCalledTimes(2);
      expect(recreateSpy).not.toHaveBeenCalled();
    } finally {
      existsSpy.mockRestore();
      recreateSpy.mockRestore();
      versionSpy.mockRestore();
    }
  });

  it('leaves the database open after a transient retry on the version-match path', async () => {
    // Regression: the retry loop's this.close() disables Dexie auto-open. For an existing
    // user whose version matches, runInitialize() returns without opening, so initialize()
    // must re-open — otherwise it reports success while every query throws DatabaseClosedError.
    const testDb = new AppDatabase(`${DB_NAME}-transient-version-match-open`);
    const internal = asOpaque<InternalAppDatabase>(testDb);

    const existsSpy = vi.spyOn(Dexie, 'exists').mockResolvedValue(true);
    const recreateSpy = vi.spyOn(internal, 'recreateDatabase');
    const versionSpy = vi.spyOn(internal, 'getExistingDbVersion');
    // First probe is dropped by WebKit; retry reports the current (matching) version.
    versionSpy
      .mockRejectedValueOnce(transientError('UnknownError', 'Connection to Indexed Database server lost'))
      .mockResolvedValue(DB_VERSION * 10);

    try {
      const result = await testDb.initialize();

      expect(result.wasDbReset).toBe(false);
      expect(recreateSpy).not.toHaveBeenCalled();
      // The connection must be usable, not left in an explicitly-closed state.
      expect(testDb.isOpen()).toBe(true);
    } finally {
      existsSpy.mockRestore();
      recreateSpy.mockRestore();
      versionSpy.mockRestore();
      await testDb.delete();
    }
  });

  it('does not delete the database when the version probe keeps failing transiently', async () => {
    const testDb = new AppDatabase(`${DB_NAME}-probe-transient-persist`);
    const internal = asOpaque<InternalAppDatabase>(testDb);

    const existsSpy = vi.spyOn(Dexie, 'exists').mockResolvedValue(true);
    const recreateSpy = vi.spyOn(internal, 'recreateDatabase');
    const versionSpy = vi
      .spyOn(internal, 'getExistingDbVersion')
      .mockRejectedValue(transientError('UnknownError', 'Connection to Indexed Database server lost'));

    try {
      await expect(testDb.initialize()).rejects.toMatchObject({
        name: 'AppError',
        code: 'INIT_FAILED',
      });
      // The transient probe failure must surface as an error, never a destructive recreate.
      expect(versionSpy).toHaveBeenCalledTimes(DB_INIT_MAX_ATTEMPTS);
      expect(recreateSpy).not.toHaveBeenCalled();
    } finally {
      existsSpy.mockRestore();
      recreateSpy.mockRestore();
      versionSpy.mockRestore();
    }
  });

  it('refuses a second recreate in one page lifetime unless allowed', async () => {
    const testDb = new AppDatabase(`${DB_NAME}-recreate-loop-breaker`);
    const internal = asOpaque<InternalAppDatabase>(testDb);

    const existsSpy = vi.spyOn(Dexie, 'exists').mockResolvedValue(true);
    const recreateSpy = vi.spyOn(internal, 'recreateDatabase').mockResolvedValue();
    // Every probe reports another build's version: a tab of that build keeps recreating the database.
    const otherBuildVersion = DB_VERSION + 1;
    const versionSpy = vi.spyOn(internal, 'getExistingDbVersion').mockResolvedValue(otherBuildVersion * 10);

    try {
      // Page start-up: the first mismatch recreates as usual.
      await expect(testDb.initialize({ allowRecreate: true })).resolves.toEqual({ wasDbReset: true });
      expect(recreateSpy).toHaveBeenCalledTimes(1);

      // Re-initialization after the other tab closed our connection: refuse, do not recreate again,
      // and probe without Dexie.exists() (its stub create/delete would close the other tab's connection).
      await expect(testDb.initialize({ allowRecreate: false })).rejects.toMatchObject({
        name: 'AppError',
        code: 'VERSION_CONFLICT',
        context: { currentVersion: otherBuildVersion, expectedVersion: DB_VERSION },
      });
      expect(recreateSpy).toHaveBeenCalledTimes(1);
      expect(existsSpy).toHaveBeenCalledTimes(1);

      // The user's explicit retry (and the default) may recreate once more.
      await expect(testDb.initialize({ allowRecreate: true })).resolves.toEqual({ wasDbReset: true });
      await expect(testDb.initialize()).resolves.toEqual({ wasDbReset: true });
      expect(recreateSpy).toHaveBeenCalledTimes(3);
    } finally {
      existsSpy.mockRestore();
      recreateSpy.mockRestore();
      versionSpy.mockRestore();
      await testDb.delete();
    }
  });

  it('recreates a mismatch on the close path until this page has recreated once', async () => {
    const testDb = new AppDatabase(`${DB_NAME}-close-path-first-recreate`);
    const internal = asOpaque<InternalAppDatabase>(testDb);

    const existsSpy = vi.spyOn(Dexie, 'exists');
    const recreateSpy = vi.spyOn(internal, 'recreateDatabase').mockResolvedValue();
    const versionSpy = vi.spyOn(internal, 'getExistingDbVersion').mockResolvedValue((DB_VERSION + 1) * 10);

    try {
      // The page started on the current version; the first mismatch seen after a close still recreates.
      await expect(testDb.initialize({ allowRecreate: false })).resolves.toEqual({ wasDbReset: true });
      expect(recreateSpy).toHaveBeenCalledTimes(1);

      // The next one is the other build taking its turn back.
      await expect(testDb.initialize({ allowRecreate: false })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
      expect(recreateSpy).toHaveBeenCalledTimes(1);
      expect(existsSpy).not.toHaveBeenCalled();
    } finally {
      existsSpy.mockRestore();
      recreateSpy.mockRestore();
      versionSpy.mockRestore();
      await testDb.delete();
    }
  });

  it('refuses to recreate an unreadable database on the close path after this page recreated it', async () => {
    const testDb = new AppDatabase(`${DB_NAME}-close-path-unreadable`);
    const internal = asOpaque<InternalAppDatabase>(testDb);

    const existsSpy = vi.spyOn(Dexie, 'exists').mockResolvedValue(true);
    const recreateSpy = vi.spyOn(internal, 'recreateDatabase').mockResolvedValue();
    const versionSpy = vi
      .spyOn(internal, 'getExistingDbVersion')
      .mockResolvedValueOnce((DB_VERSION + 1) * 10)
      .mockRejectedValue(new Error('corrupt version metadata'));

    try {
      await expect(testDb.initialize({ allowRecreate: true })).resolves.toEqual({ wasDbReset: true });

      closeFromOtherConnection(testDb);
      await expect(testDb.initialize({ allowRecreate: false })).rejects.toMatchObject({
        code: 'VERSION_CONFLICT',
        context: { currentVersion: null, expectedVersion: DB_VERSION },
        cause: expect.objectContaining({ message: 'corrupt version metadata' }),
      });
      expect(recreateSpy).toHaveBeenCalledTimes(1);
      // A deterministic probe failure is not retried.
      expect(versionSpy).toHaveBeenCalledTimes(2);
    } finally {
      existsSpy.mockRestore();
      recreateSpy.mockRestore();
      versionSpy.mockRestore();
      await testDb.delete();
    }
  });

  it('recreates an unreadable database after a forced close, which is no other tab at work', async () => {
    // e.g. storage eviction: the connection closes without `versionchange` and takes the database with it.
    const testDb = new AppDatabase(`${DB_NAME}-close-path-forced-unreadable`);
    const internal = asOpaque<InternalAppDatabase>(testDb);

    const existsSpy = vi.spyOn(Dexie, 'exists').mockResolvedValue(true);
    const recreateSpy = vi.spyOn(internal, 'recreateDatabase').mockResolvedValue();
    const versionSpy = vi
      .spyOn(internal, 'getExistingDbVersion')
      .mockResolvedValueOnce((DB_VERSION + 1) * 10)
      .mockRejectedValue(new Error('corrupt version metadata'));

    try {
      await expect(testDb.initialize({ allowRecreate: true })).resolves.toEqual({ wasDbReset: true });

      await expect(testDb.initialize({ allowRecreate: false })).resolves.toEqual({ wasDbReset: true });
      expect(recreateSpy).toHaveBeenCalledTimes(2);
    } finally {
      existsSpy.mockRestore();
      recreateSpy.mockRestore();
      versionSpy.mockRestore();
      await testDb.delete();
    }
  });

  it('recreates an unreadable database on the close path before this page has recreated, then refuses', async () => {
    const testDb = new AppDatabase(`${DB_NAME}-close-path-first-unreadable`);
    const internal = asOpaque<InternalAppDatabase>(testDb);

    const existsSpy = vi.spyOn(Dexie, 'exists');
    const recreateSpy = vi.spyOn(internal, 'recreateDatabase').mockResolvedValue();
    const versionSpy = vi
      .spyOn(internal, 'getExistingDbVersion')
      .mockRejectedValueOnce(new Error('corrupt version metadata'))
      .mockResolvedValue((DB_VERSION + 1) * 10);

    try {
      closeFromOtherConnection(testDb);
      await expect(testDb.initialize({ allowRecreate: false })).resolves.toEqual({ wasDbReset: true });
      expect(recreateSpy).toHaveBeenCalledTimes(1);

      // That recreate counts: the other build's next turn is refused.
      closeFromOtherConnection(testDb);
      await expect(testDb.initialize({ allowRecreate: false })).rejects.toMatchObject({
        code: 'VERSION_CONFLICT',
        context: { currentVersion: DB_VERSION + 1, expectedVersion: DB_VERSION },
      });
      expect(recreateSpy).toHaveBeenCalledTimes(1);
      expect(existsSpy).not.toHaveBeenCalled();
    } finally {
      existsSpy.mockRestore();
      recreateSpy.mockRestore();
      versionSpy.mockRestore();
      await testDb.delete();
    }
  });

  it('restarts the close-path probe after a transient failure on a re-check', async () => {
    const testDb = new AppDatabase(`${DB_NAME}-close-path-recheck-transient`);
    const internal = asOpaque<InternalAppDatabase>(testDb);

    const recreateSpy = vi.spyOn(internal, 'recreateDatabase');
    const versionSpy = vi
      .spyOn(internal, 'getExistingDbVersion')
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(transientError('UnknownError', 'Connection to Indexed Database server lost'))
      .mockResolvedValue(DB_VERSION * 10);

    try {
      await expect(testDb.initialize({ allowRecreate: false })).resolves.toEqual({ wasDbReset: false });
      expect(versionSpy).toHaveBeenCalledTimes(3);
      expect(recreateSpy).not.toHaveBeenCalled();
      expect(testDb.isOpen()).toBe(true);
    } finally {
      recreateSpy.mockRestore();
      versionSpy.mockRestore();
      await testDb.delete();
    }
  });

  it('retries a transient version probe failure on the close path', async () => {
    const testDb = new AppDatabase(`${DB_NAME}-close-path-transient`);
    const internal = asOpaque<InternalAppDatabase>(testDb);

    const existsSpy = vi.spyOn(Dexie, 'exists');
    const recreateSpy = vi.spyOn(internal, 'recreateDatabase');
    const versionSpy = vi
      .spyOn(internal, 'getExistingDbVersion')
      .mockRejectedValueOnce(transientError('UnknownError', 'Connection to Indexed Database server lost'))
      .mockResolvedValue(DB_VERSION * 10);

    try {
      await expect(testDb.initialize({ allowRecreate: false })).resolves.toEqual({ wasDbReset: false });
      expect(versionSpy).toHaveBeenCalledTimes(2);
      expect(recreateSpy).not.toHaveBeenCalled();
      expect(existsSpy).not.toHaveBeenCalled();
      expect(testDb.isOpen()).toBe(true);
    } finally {
      existsSpy.mockRestore();
      recreateSpy.mockRestore();
      versionSpy.mockRestore();
      await testDb.delete();
    }
  });

  it('still recreates the database when the version probe fails non-transiently', async () => {
    const testDb = new AppDatabase(`${DB_NAME}-probe-nontransient-recreate`);
    const internal = asOpaque<InternalAppDatabase>(testDb);

    const existsSpy = vi.spyOn(Dexie, 'exists').mockResolvedValue(true);
    const recreateSpy = vi.spyOn(internal, 'recreateDatabase').mockResolvedValue();
    const versionSpy = vi
      .spyOn(internal, 'getExistingDbVersion')
      .mockRejectedValue(new Error('corrupt version metadata'));

    try {
      const result = await testDb.initialize();

      // Genuinely unreadable versions still self-heal via recreate, with no retry.
      expect(result.wasDbReset).toBe(true);
      expect(recreateSpy).toHaveBeenCalledTimes(1);
      expect(versionSpy).toHaveBeenCalledTimes(1);
    } finally {
      existsSpy.mockRestore();
      recreateSpy.mockRestore();
      versionSpy.mockRestore();
    }
  });
});

// ADR-0019: a tab of another build deletes the database and reopens it at its own version. Our connection is
// closed by that delete (Dexie's `versionchange` handler fires `close` synchronously), and DatabaseProvider
// re-initializes with `allowRecreate: false` from that event, inside the other tab's delete→reopen window.
describe('Re-initialization after another tab closed the connection', () => {
  const OTHER_BUILD_RAW_VERSION = (DB_VERSION + 1) * 10;

  type Outcome = { value?: { wasDbReset: boolean }; error?: unknown };

  // Mirrors DatabaseProvider's close handler, once, and records how the re-initialization settled.
  const reinitializeOnNextClose = (database: AppDatabase) =>
    new Promise<Outcome>((resolve) => {
      const onClose = () => {
        database.on('close').unsubscribe(onClose);
        database.initialize({ allowRecreate: false }).then(
          (value) => resolve({ value }),
          (error: unknown) => resolve({ error }),
        );
      };
      database.on('close', onClose);
    });

  // The other tab's recreate: delete, then (unless it never comes back) reopen and keep running.
  const recreateFromOtherTab = async <T>(name: string, reopen?: () => Promise<T>) => {
    await deleteNativeDatabase(name);
    return reopen?.();
  };

  const listDatabaseNames = async () => (await indexedDB.databases()).map(({ name }) => name);

  // Lets the rechecks' setTimeout delays elapse while fake-indexeddb's own tasks (setImmediate) keep running.
  const runUntilSettled = async (outcome: Promise<Outcome>) => {
    let isSettled = false;
    void outcome.then(() => {
      isSettled = true;
    });
    for (let elapsed = 0; !isSettled && elapsed < 10_000; elapsed += 25) await vi.advanceTimersByTimeAsync(25);
    expect(isSettled).toBe(true);
    return outcome;
  };

  // Starts this page the way a new build meets an old database: the first load recreates it.
  const startOnOtherBuildDatabase = async (name: string) => {
    const testDb = new AppDatabase(name);
    await deleteNativeDatabase(name, () => testDb.close());
    (await openOtherBuildDatabase(name, OTHER_BUILD_RAW_VERSION)).close();
    await expect(testDb.initialize({ allowRecreate: true })).resolves.toEqual({ wasDbReset: true });
    return testDb;
  };

  const spyOnDatabaseAccess = (testDb: AppDatabase) => ({
    exists: vi.spyOn(Dexie, 'exists'),
    recreate: vi.spyOn(asOpaque<InternalAppDatabase>(testDb), 'recreateDatabase'),
    open: vi.spyOn(indexedDB, 'open'),
    deleteDatabase: vi.spyOn(indexedDB, 'deleteDatabase'),
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // Dexie warns when another connection deletes the database under it.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reads a missing database as null without creating or deleting anything', async () => {
    const name = `${DB_NAME}-passive-probe-missing`;
    const testDb = new AppDatabase(name);
    await deleteNativeDatabase(name);
    const deleteSpy = vi.spyOn(indexedDB, 'deleteDatabase');

    await expect(asOpaque<InternalAppDatabase>(testDb).getExistingDbVersion()).resolves.toBeNull();

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(await listDatabaseNames()).not.toContain(name);
  });

  it('surfaces VERSION_CONFLICT when another build reopens the database after this page recreated it', async () => {
    const name = `${DB_NAME}-other-build-race`;
    const testDb = await startOnOtherBuildDatabase(name);
    const spies = spyOnDatabaseAccess(testDb);
    let otherTabVersionChanges = 0;
    let otherTab: IDBDatabase | undefined;

    try {
      const reinitialized = reinitializeOnNextClose(testDb);
      otherTab = await recreateFromOtherTab(name, () =>
        openOtherBuildDatabase(name, OTHER_BUILD_RAW_VERSION, () => otherTabVersionChanges++),
      );
      const outcome = await runUntilSettled(reinitialized);

      expect(outcome.error).toMatchObject({
        name: 'AppError',
        code: 'VERSION_CONFLICT',
        context: { currentVersion: DB_VERSION + 1, expectedVersion: DB_VERSION },
      });
      // No second recreate, no Dexie.exists() stub, no delete of ours, and only versionless probes.
      expect(spies.recreate).not.toHaveBeenCalled();
      expect(spies.exists).not.toHaveBeenCalled();
      expect(spies.deleteDatabase).toHaveBeenCalledTimes(1); // the other tab's
      const versionedOpens = spies.open.mock.calls.filter((args) => args.length > 1);
      expect(versionedOpens).toEqual([[name, OTHER_BUILD_RAW_VERSION]]); // the other tab's
      // The first probe met the missing database, a recheck found the other build's version.
      expect(spies.open.mock.calls.length - versionedOpens.length).toBeGreaterThanOrEqual(2);
      // The other tab was never closed by us and keeps its own database.
      expect(otherTabVersionChanges).toBe(0);

      // Nothing on this page reopens the database afterwards: auto-open is off.
      expect(testDb.isOpen()).toBe(false);
      await expect(testDb.user_counts.get('any-user')).rejects.toMatchObject({ name: 'DatabaseClosedError' });
      expect(spies.open.mock.calls.filter((args) => args.length > 1)).toHaveLength(1);
      expect(otherTabVersionChanges).toBe(0);
    } finally {
      otherTab?.close();
      await testDb.delete();
    }
  });

  it('opens the database when a tab of the same build reopens it during the recheck', async () => {
    const name = `${DB_NAME}-same-build-race`;
    const testDb = await startOnOtherBuildDatabase(name);
    const sameBuildTab = new AppDatabase(name);
    const spies = spyOnDatabaseAccess(testDb);

    try {
      const reinitialized = reinitializeOnNextClose(testDb);
      await recreateFromOtherTab(name, async () => {
        await sameBuildTab.open();
      });
      const outcome = await runUntilSettled(reinitialized);

      expect(outcome).toEqual({ value: { wasDbReset: false } });
      expect(testDb.isOpen()).toBe(true);
      expect(sameBuildTab.isOpen()).toBe(true);
      expect(spies.recreate).not.toHaveBeenCalled();
      expect(spies.exists).not.toHaveBeenCalled();
      expect(spies.deleteDatabase).toHaveBeenCalledTimes(1); // the other tab's
    } finally {
      sameBuildTab.close();
      await testDb.delete();
    }
  });

  it('reports the conflict without creating the database when it stays missing', async () => {
    const name = `${DB_NAME}-stays-missing`;
    const testDb = await startOnOtherBuildDatabase(name);
    const spies = spyOnDatabaseAccess(testDb);

    try {
      const reinitialized = reinitializeOnNextClose(testDb);
      await recreateFromOtherTab(name);
      // Something on this page queries during the re-check window: it must not reopen (and so create) the database.
      const backgroundQuery = testDb.user_counts.get('any-user').catch((error: unknown) => error);
      const outcome = await runUntilSettled(reinitialized);

      expect(outcome.error).toMatchObject({
        code: 'VERSION_CONFLICT',
        context: { currentVersion: null, expectedVersion: DB_VERSION },
      });
      expect(await backgroundQuery).toMatchObject({ name: 'DatabaseClosedError' });
      // Every probe was versionless, bounded by the re-check schedule, and nothing was created.
      expect(spies.open).toHaveBeenCalledTimes(DB_CLOSE_RECHECK_DELAYS_MS.length + 1);
      expect(spies.open.mock.calls.every((args) => args.length === 1)).toBe(true);
      expect(spies.deleteDatabase).toHaveBeenCalledTimes(1); // the other tab's
      expect(spies.recreate).not.toHaveBeenCalled();
      expect(await listDatabaseNames()).not.toContain(name);
    } finally {
      await testDb.delete();
    }
  });

  it('re-checks a missing database on the DB_CLOSE_RECHECK_DELAYS_MS schedule before deciding', async () => {
    const name = `${DB_NAME}-recheck-schedule`;
    const testDb = await startOnOtherBuildDatabase(name);
    const versionSpy = vi.spyOn(asOpaque<InternalAppDatabase>(testDb), 'getExistingDbVersion').mockResolvedValue(null);

    try {
      closeFromOtherConnection(testDb);
      const outcome = testDb.initialize({ allowRecreate: false }).then(
        (value): Outcome => ({ value }),
        (error: unknown): Outcome => ({ error }),
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(versionSpy).toHaveBeenCalledTimes(1);

      // Each re-check waits its full delay: not one millisecond early.
      let probes = 1;
      for (const waitMs of DB_CLOSE_RECHECK_DELAYS_MS) {
        await vi.advanceTimersByTimeAsync(waitMs - 1);
        expect(versionSpy).toHaveBeenCalledTimes(probes);
        await vi.advanceTimersByTimeAsync(1);
        expect(versionSpy).toHaveBeenCalledTimes(++probes);
      }

      expect((await outcome).error).toMatchObject({
        code: 'VERSION_CONFLICT',
        context: { currentVersion: null, expectedVersion: DB_VERSION },
      });
    } finally {
      await testDb.delete();
    }
  });

  it('does not carry a versionchange that arrived during an earlier run into the next one', async () => {
    const name = `${DB_NAME}-stale-versionchange`;
    const testDb = new AppDatabase(name);
    await deleteNativeDatabase(name, () => testDb.close());
    const internal = asOpaque<InternalAppDatabase>(testDb);
    vi.spyOn(Dexie, 'exists').mockResolvedValue(true);
    vi.spyOn(internal, 'recreateDatabase').mockResolvedValue();
    const versionSpy = vi.spyOn(internal, 'getExistingDbVersion').mockImplementationOnce(async () => {
      // Another connection's delete lands while start-up runs; DatabaseProvider ignores that close.
      closeFromOtherConnection(testDb);
      return OTHER_BUILD_RAW_VERSION;
    });

    try {
      await expect(testDb.initialize({ allowRecreate: true })).resolves.toEqual({ wasDbReset: true });

      // Later a forced close (no versionchange) loses the database: it is created again, not a conflict.
      versionSpy.mockResolvedValue(null);
      const outcome = await runUntilSettled(
        testDb.initialize({ allowRecreate: false }).then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        ),
      );
      expect(outcome).toEqual({ value: { wasDbReset: true } });
    } finally {
      await testDb.delete();
    }
  });

  it('creates the database again after a forced close lost it, even after this page recreated it', async () => {
    // e.g. storage eviction or cleared site data: the connection closes without `versionchange`, no tab is at work.
    const name = `${DB_NAME}-forced-close`;
    const testDb = await startOnOtherBuildDatabase(name);
    const spies = spyOnDatabaseAccess(testDb);

    try {
      const reinitialized = reinitializeOnNextClose(testDb);
      // fake-indexeddb 6.2.7 types the parameter as the FDBDatabase constructor; the runtime takes the connection.
      forceCloseDatabase(asOpaque<Parameters<typeof forceCloseDatabase>[0]>(testDb.backendDB()));
      await deleteNativeDatabase(name);
      const outcome = await runUntilSettled(reinitialized);

      expect(outcome).toEqual({ value: { wasDbReset: true } });
      expect(testDb.isOpen()).toBe(true);
      expect(await readNativeDatabaseVersion(name)).toBe(DB_VERSION * 10);
      expect(spies.exists).not.toHaveBeenCalled();
      expect(spies.recreate).not.toHaveBeenCalled();
      expect(spies.deleteDatabase).toHaveBeenCalledTimes(1); // the eviction's
    } finally {
      await testDb.delete();
    }
  });

  it('creates a missing database on the close path when this page has not recreated it', async () => {
    // e.g. the user deleted the database in devtools: before any recreate this stays self-healing.
    const name = `${DB_NAME}-close-path-create`;
    const testDb = new AppDatabase(name);
    await deleteNativeDatabase(name, () => testDb.close());
    await expect(testDb.initialize()).resolves.toEqual({ wasDbReset: true });
    const spies = spyOnDatabaseAccess(testDb);

    try {
      const reinitialized = reinitializeOnNextClose(testDb);
      await recreateFromOtherTab(name);
      const outcome = await runUntilSettled(reinitialized);

      expect(outcome).toEqual({ value: { wasDbReset: true } });
      expect(testDb.isOpen()).toBe(true);
      expect(await readNativeDatabaseVersion(name)).toBe(DB_VERSION * 10);
      expect(spies.exists).not.toHaveBeenCalled();
      expect(spies.recreate).not.toHaveBeenCalled();
    } finally {
      await testDb.delete();
    }
  });
});

describe('isTransientIndexedDbError', () => {
  it('detects transient WebKit/IndexedDB error names', () => {
    expect(isTransientIndexedDbError(transientError('UnknownError'))).toBe(true);
    expect(isTransientIndexedDbError(transientError('AbortError'))).toBe(true);
  });

  it('detects transient errors by message', () => {
    expect(isTransientIndexedDbError(new Error('Connection to Indexed Database server lost'))).toBe(true);
    expect(isTransientIndexedDbError(new Error('Database deleted by request of the user'))).toBe(true);
    expect(isTransientIndexedDbError(new Error('Transaction aborted'))).toBe(true);
    expect(isTransientIndexedDbError(new Error('Attempt to delete range without an in-progress transaction'))).toBe(
      true,
    );
  });

  it('walks the cause chain (e.g. a wrapped AppError)', () => {
    const wrapped = Object.assign(new Error('Failed to initialize database, indexedDB'), {
      name: 'AppError',
      cause: transientError('UnknownError', 'Connection to Indexed Database server lost'),
    });

    expect(isTransientIndexedDbError(wrapped)).toBe(true);
  });

  it('returns false for deterministic or non-error values', () => {
    expect(isTransientIndexedDbError(new TypeError('boom'))).toBe(false);
    expect(isTransientIndexedDbError(new Error('Schema mismatch'))).toBe(false);
    expect(isTransientIndexedDbError(null)).toBe(false);
    expect(isTransientIndexedDbError(undefined)).toBe(false);
    expect(isTransientIndexedDbError('UnknownError')).toBe(false);
  });
});
