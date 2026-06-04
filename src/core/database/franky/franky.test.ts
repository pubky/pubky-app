import Dexie from 'dexie';
import { indexedDB } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DB_INIT_MAX_ATTEMPTS, DB_NAME, DB_VERSION } from '@/config/database';
import { AppDatabase, isTransientIndexedDbError } from '@/database/franky/franky';
import { Logger } from '@/libs/logger/logger';
import { asOpaque } from '@/test-utils/type-assertions';

const transientError = (name: string, message = '') => Object.assign(new Error(message), { name });

// Test-only view onto the private members exercised by the version-probe regression tests.
type InternalAppDatabase = {
  getExistingDbVersion: () => Promise<number | null>;
  recreateDatabase: (currentVersion: number | null, rawVersion?: number | null) => Promise<void>;
};

const waitForDatabaseDeletion = async (name: string, onBlocked?: () => void) => {
  await new Promise<void>((resolve, reject) => {
    const deleteRequest = indexedDB.deleteDatabase(name);

    deleteRequest.onsuccess = () => resolve();
    deleteRequest.onerror = () => reject(deleteRequest.error ?? new Error('Failed to delete database'));
    deleteRequest.onblocked = () => {
      onBlocked?.();
    };
  });
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

    await waitForDatabaseDeletion(reproductionDbName, () => reproductionDb.close());

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

    await waitForDatabaseDeletion(testDbName, () => testDb.close());

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

    await waitForDatabaseDeletion(testDbName, () => testDb.close());

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

    await waitForDatabaseDeletion(testDbName, () => testDb.close());

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

    await waitForDatabaseDeletion(testDbName, () => testDb.close());

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
