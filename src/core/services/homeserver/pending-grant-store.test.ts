import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';
import { createTestWebLocks } from '@/test-utils/web-locks';
import {
  PENDING_GRANT_RESUME_WINDOW_MS,
  type PendingGrantLease,
  type PendingGrantRecord,
  PendingGrantStore,
} from './pending-grant-store';

vi.mock('@/libs/observability/sentry', () => ({ captureAppError: vi.fn() }));
vi.mock('@/libs/logger/logger', () => ({ Logger: { error: vi.fn(), warn: vi.fn() } }));

const DATABASE = 'pubky-app-pending-grants-v1';
const REJECTED_PREFIX = 'pubky-app-rejected-grant-v1:';
const context = JSON.stringify({ purpose: 'signin', generation: 'one', environment: 'staging' });
const leases: PendingGrantLease[] = [];

function record(overrides: Partial<PendingGrantRecord> = {}): PendingGrantRecord {
  return {
    id: crypto.randomUUID(),
    context,
    createdAt: Date.now(),
    mode: 'delegated',
    saved: 'opaque-sdk-serialization',
    ...overrides,
  };
}

// Honor Web Locks' callback lifetime: requesting an already-held name with
// ifAvailable returns null, and the lock is released only when the callback ends.
function installLocks() {
  vi.stubGlobal('navigator', asOpaque<Navigator>({ locks: createTestWebLocks() }));
}

async function claim(id: string) {
  const lease = await vi.waitFor(async () => {
    const lease = await PendingGrantStore.claim(id);
    expect(lease).not.toBeNull();
    return lease;
  });
  if (!lease) throw new Error('Expected an available attempt');
  leases.push(lease);
  return lease;
}

async function seed(records: unknown[]) {
  await PendingGrantStore.getCandidates(context);
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('pending', 'readwrite');
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onabort = () => reject(transaction.error);
      for (const item of records) transaction.objectStore('pending').put(item);
    };
    request.onerror = () => reject(request.error);
  });
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  installLocks();
  localStorage.clear();
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const lease of leases.splice(0)) {
    if (lease.active) await lease.remove();
    lease.release();
  }
  vi.unstubAllGlobals();
});

describe('durable pending delegated sign-in', () => {
  it('persists opaque SDK serialization and reads it after sessionStorage has been lost', async () => {
    const saved = record();
    const lease = await claim(saved.id);
    await lease.save(saved);
    lease.release();
    sessionStorage.clear();

    expect(await PendingGrantStore.getCandidates(context)).toEqual([saved]);
    const resumed = await claim(saved.id);
    expect(await resumed.read()).toEqual(saved);
  });

  it('returns only the exact context, prefers the tab attempt, and otherwise uses newest first', async () => {
    const older = record({ createdAt: Date.now() - 10_000 });
    const newer = record();
    const anotherContext = record({ context: JSON.stringify({ ...JSON.parse(context), generation: 'two' }) });
    await seed([older, newer, anotherContext]);

    expect(await PendingGrantStore.getCandidates(context)).toEqual([newer, older]);
    expect(await PendingGrantStore.getCandidates(context, older.id)).toEqual([older, newer]);
    expect(await PendingGrantStore.getCandidates(anotherContext.context)).toEqual([anotherContext]);
  });

  it('prunes expired, future-dated, malformed and local-mode records', async () => {
    const valid = record();
    const expired = record({ createdAt: Date.now() - PENDING_GRANT_RESUME_WINDOW_MS });
    const future = record({ createdAt: Date.now() + 60_000 });
    const malformed = { id: crypto.randomUUID(), saved: 'malformed-secret' };
    const local = { ...record(), mode: 'local' };
    await seed([valid, expired, future, malformed, local]);

    expect(await PendingGrantStore.getCandidates(context)).toEqual([valid]);
    const lease = await claim(expired.id);
    expect(await lease.read()).toBeNull();
  });

  it('allows exactly one owner and rechecks the record after acquiring ownership', async () => {
    const saved = record();
    const first = await claim(saved.id);
    await first.save(saved);
    expect(await PendingGrantStore.claim(saved.id)).toBeNull();
    expect(await PendingGrantStore.getCandidates(context)).toEqual([saved]);
    await first.remove();
    first.release();
    const second = await claim(saved.id);
    expect(await second.read()).toBeNull();
  });

  it('imports a valid legacy hint only for its owned attempt when durable storage has no record', async () => {
    const saved = record();
    const lease = await claim(saved.id);

    expect(await lease.read(saved)).toEqual(saved);
    expect(await lease.read(record())).toBeNull();
    expect(await lease.read({ ...saved, createdAt: Date.now() - PENDING_GRANT_RESUME_WINDOW_MS })).toBeNull();
    expect(await PendingGrantStore.getCandidates(context)).toEqual([]);
    await lease.save(saved);
    expect(await PendingGrantStore.getCandidates(context)).toEqual([saved]);
  });

  it('ignores a canceled legacy hint copied to another tab after durable deletion', async () => {
    const saved = record();
    const original = await claim(saved.id);
    await original.save(saved);
    await original.remove();
    original.release();
    const reopened = await claim(saved.id);

    expect(await reopened.read(saved)).toBeNull();
    expect(await PendingGrantStore.getCandidates(context)).toEqual([]);
  });

  it('does not replace invalid durable data with a valid legacy hint', async () => {
    const saved = record();
    await seed([{ ...saved, mode: 'local' }]);
    const lease = await claim(saved.id);

    expect(await lease.read(saved)).toBeNull();
    expect(await PendingGrantStore.getCandidates(context)).toEqual([]);
  });

  it('a released lease cannot save or remove a record owned by a later claimant', async () => {
    const saved = record();
    const first = await claim(saved.id);
    await first.save(saved);
    first.release();
    const second = await claim(saved.id);
    await second.save({ ...saved, saved: 'new-serialization' });

    first.release();
    await first.remove();
    await expect(first.save(saved)).rejects.toMatchObject({ code: 'WRITE_FAILED' });
    expect((await second.read())?.saved).toBe('new-serialization');
    expect(second.active).toBe(true);
  });

  it('does not resolve a save at request success before the transaction commits', async () => {
    const saved = record();
    const lease = await claim(saved.id);
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      const request = put.apply(this, args);
      request.addEventListener('success', () => this.transaction.abort());
      return request;
    });

    await expect(lease.save(saved)).rejects.toMatchObject({ code: 'WRITE_FAILED' });
    expect(await lease.read()).toBeNull();
  });

  it('does not report a read as absence when IndexedDB cannot open', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException('secret-sdk-data', 'InvalidStateError');
    });
    const failure = await PendingGrantStore.getCandidates(context).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'INIT_FAILED' });
    expect(JSON.stringify(failure)).not.toContain('secret-sdk-data');
  });

  it('does not return a successful read from an aborted transaction', async () => {
    const saved = record();
    const lease = await claim(saved.id);
    await lease.save(saved);
    const get = IDBObjectStore.prototype.get;
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, ...args) {
      const request = get.apply(this, args);
      request.addEventListener('success', () => this.transaction.abort());
      return request;
    });
    await expect(lease.read()).rejects.toMatchObject({ code: 'QUERY_FAILED' });
  });

  it('does not treat an unreadable rejection marker as an absent marker', async () => {
    const saved = record();
    const lease = await claim(saved.id);
    await lease.save(saved);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('unavailable');
    });
    await expect(lease.read()).rejects.toMatchObject({ code: 'QUERY_FAILED' });
    vi.restoreAllMocks();
    expect(await lease.read()).toEqual(saved);
  });

  it('writes an id-only rejection marker synchronously and cannot save after cancellation', async () => {
    const saved = record();
    const lease = await claim(saved.id);
    await lease.save(saved);

    const removal = lease.remove();
    expect(Number(localStorage.getItem(`${REJECTED_PREFIX}${saved.id}`))).toBeGreaterThan(Date.now());
    expect(JSON.stringify(localStorage)).not.toContain(saved.saved);
    await removal;
    await expect(lease.save(saved)).rejects.toMatchObject({ code: 'WRITE_FAILED' });
    expect(await PendingGrantStore.getCandidates(context)).toEqual([]);
  });

  it('keeps canceled records unavailable after a failed delete and a new page claim', async () => {
    const saved = record();
    const lease = await claim(saved.id);
    await lease.save(saved);
    const failure = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(() => {
      throw new DOMException('Delete failed');
    });
    await expect(lease.remove()).rejects.toMatchObject({ code: 'DELETE_FAILED' });
    lease.release();
    failure.mockRestore();

    expect(await PendingGrantStore.getCandidates(context)).toEqual([]);
    const next = await claim(saved.id);
    expect(await next.read()).toBeNull();
    await expect(next.save(saved)).rejects.toMatchObject({ code: 'WRITE_FAILED' });
  });

  it('keeps ownership when marker and delete both fail, then permits cleanup retry', async () => {
    const saved = record();
    const lease = await claim(saved.id);
    await lease.save(saved);
    const markerFailure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage full');
    });
    const deleteFailure = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(() => {
      throw new DOMException('Delete failed');
    });

    await expect(lease.remove()).rejects.toMatchObject({ code: 'DELETE_FAILED' });
    lease.release();
    expect(lease.active).toBe(true);
    expect(await PendingGrantStore.claim(saved.id)).toBeNull();

    markerFailure.mockRestore();
    deleteFailure.mockRestore();
    await lease.remove();
    expect(lease.active).toBe(false);
    expect(await PendingGrantStore.getCandidates(context)).toEqual([]);
    expect(await claim(saved.id)).toBeDefined();
  });

  it('holds the lock until delete commits when the synchronous marker cannot be written', async () => {
    const saved = record();
    const lease = await claim(saved.id);
    await lease.save(saved);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage full');
    });

    const removal = lease.remove();
    lease.release();
    expect(lease.active).toBe(true);
    expect(await PendingGrantStore.claim(saved.id)).toBeNull();
    await expect(removal).rejects.toMatchObject({ code: 'DELETE_FAILED' });
    expect(lease.active).toBe(false);
    expect(await PendingGrantStore.getCandidates(context)).toEqual([]);
  });

  it('serializes a pending save before removal and defers release until both have finished', async () => {
    const saved = record();
    const lease = await claim(saved.id);
    const saving = lease.save(saved);
    const removing = lease.remove();
    lease.release();

    await expect(saving).rejects.toMatchObject({ code: 'WRITE_FAILED' });
    await removing;
    expect(lease.active).toBe(false);
    expect(await PendingGrantStore.getCandidates(context)).toEqual([]);
  });

  it('fails closed if Web Locks is unavailable or lock acquisition rejects', async () => {
    vi.stubGlobal('navigator', asOpaque<Navigator>({}));
    await expect(PendingGrantStore.claim(crypto.randomUUID())).rejects.toMatchObject({ code: 'INIT_FAILED' });
    vi.stubGlobal(
      'navigator',
      asOpaque<Navigator>({
        locks: {
          request: vi.fn().mockRejectedValue(new DOMException('Private lock data')),
        },
      }),
    );
    await expect(PendingGrantStore.claim(crypto.randomUUID())).rejects.toMatchObject({ code: 'INIT_FAILED' });
  });
});
