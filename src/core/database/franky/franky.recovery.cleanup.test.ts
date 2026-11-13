import Dexie, { type Table } from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { suspendIndexedDbRecovery, withIndexedDbRecovery } from './franky.recovery';

describe('IndexedDB recovery across account cleanup without close', () => {
  let database: Dexie;
  let rows: Table<{ id: string }>;

  beforeEach(async () => {
    database = new Dexie('connection-recovery-cleanup');
    database.version(1).stores({ rows: 'id' });
    await database.open();
    rows = database.table('rows');
    await rows.put({ id: 'previous-account' });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await database.delete();
  });

  it('resets a failed-replay fence while retaining the same backend connection', async () => {
    const failure = new DOMException('Connection lost', 'UnknownError');
    const failing = vi.fn().mockRejectedValue(failure);
    await expect(withIndexedDbRecovery(database, failing)).rejects.toBe(failure);
    expect(failing).toHaveBeenCalledTimes(2);

    const connection = database.backendDB();
    const close = vi.spyOn(database, 'close');
    const resume = suspendIndexedDbRecovery(database);
    try {
      await rows.clear();
    } finally {
      resume();
    }
    expect(database.backendDB()).toBe(connection);
    expect(close).not.toHaveBeenCalled();

    await rows.put({ id: 'current-account' });
    const later = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockImplementation(() => rows.get('current-account'));
    await expect(withIndexedDbRecovery(database, later)).resolves.toEqual({ id: 'current-account' });
    expect(later).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledOnce();
    expect(await rows.get('previous-account')).toBeUndefined();
  });

  it('does not reconnect for an operation that fails after cleanup has resumed recovery', async () => {
    const failure = new DOMException('Connection lost', 'UnknownError');
    const pending = Promise.withResolvers<{ id: string } | undefined>();
    const operation = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockImplementation(() => rows.get('previous-account'));
    const connection = database.backendDB();
    const close = vi.spyOn(database, 'close');
    const result = expect(withIndexedDbRecovery(database, operation)).rejects.toBe(failure);

    const resume = suspendIndexedDbRecovery(database);
    try {
      await rows.clear();
    } finally {
      resume();
    }
    expect(database.backendDB()).toBe(connection);
    expect(close).not.toHaveBeenCalled();

    pending.reject(failure);
    await result;
    expect(operation).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    expect(database.backendDB()).toBe(connection);
    expect(await rows.count()).toBe(0);
  });
});
