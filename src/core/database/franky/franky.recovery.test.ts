import Dexie, { type Table } from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { suspendIndexedDbRecovery, withIndexedDbRecovery } from './franky.recovery';

describe('IndexedDB recovery lifecycle', () => {
  let database: Dexie;
  let rows: Table<{ id: string }>;

  beforeEach(async () => {
    database = new Dexie('connection-recovery-lifecycle');
    database.version(1).stores({ rows: 'id' });
    await database.open();
    rows = database.table('rows');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await database.delete();
  });

  it('does not reconnect again from a connection whose replay already failed', async () => {
    const failure = new DOMException('Connection lost', 'UnknownError');
    const operation = vi.fn().mockRejectedValue(failure);
    const close = vi.spyOn(database, 'close');
    const schedule = vi.spyOn(Dexie, 'asap');

    await expect(withIndexedDbRecovery(database, operation)).rejects.toBe(failure);
    await expect(withIndexedDbRecovery(database, operation)).rejects.toBe(failure);

    expect(operation).toHaveBeenCalledTimes(3);
    expect(close).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(1);

    database.close();
    await database.open();
    operation.mockResolvedValueOnce('healthy');
    await expect(withIndexedDbRecovery(database, operation)).resolves.toBe('healthy');
    operation.mockRejectedValueOnce(failure).mockResolvedValueOnce('recovered');
    await expect(withIndexedDbRecovery(database, operation)).resolves.toBe('recovered');
    expect(close).toHaveBeenCalledTimes(3);
    expect(schedule).toHaveBeenCalledTimes(2);
  });

  it.each([
    { name: 'absent abort cause', failure: new Dexie.AbortError('Transaction aborted') },
    {
      name: 'wrapped connection loss',
      failure: new Dexie.AbortError(new DOMException('Connection lost', 'UnknownError')),
    },
  ])('retains recovery for $name', async ({ failure }) => {
    const operation = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue('recovered');
    await expect(withIndexedDbRecovery(database, operation)).resolves.toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('retains the original operation error when reopening fails', async () => {
    const failure = new DOMException('Connection lost', 'UnknownError');
    const openFailure = new DOMException('Reopen failed', 'UnknownError');
    const operation = vi.fn().mockRejectedValue(failure);
    vi.spyOn(database, 'open').mockRejectedValueOnce(openFailure);

    await expect(withIndexedDbRecovery(database, operation)).rejects.toBe(failure);
    expect(failure).toMatchObject({ cause: { name: 'UnknownError', inner: openFailure } });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('lets a caller transaction scheduled beside a failing read commit', async () => {
    const failure = new DOMException('Connection lost', 'UnknownError');
    const operation = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockImplementation(() => rows.get('saved'));
    const read = withIndexedDbRecovery(database, operation);
    const write = database.transaction('rw', rows, () => rows.put({ id: 'saved' }));

    const [, savedId] = await Promise.all([read, write]);
    expect(savedId).toBe('saved');
    expect(await rows.get('saved')).toEqual({ id: 'saved' });
  });

  it('lets a caller transaction commit after a failing table read advances through native microtasks', async () => {
    vi.spyOn(database.core, 'transaction').mockImplementationOnce(() => {
      throw new DOMException('Connection lost', 'UnknownError');
    });
    const read = withIndexedDbRecovery(database, () => rows.get('saved'));
    const write = Promise.resolve()
      .then(() => undefined)
      .then(() => undefined)
      .then(() => undefined)
      .then(() => undefined)
      .then(() => database.transaction('rw', rows, () => rows.put({ id: 'saved' })));

    const [, savedId] = await Promise.all([read, write]);
    expect(savedId).toBe('saved');
    expect(await rows.get('saved')).toEqual({ id: 'saved' });
  });

  it('does not close the database if cleanup supersedes the queued reconnect', async () => {
    const failure = new DOMException('Connection lost', 'UnknownError');
    const operation = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue('stale');
    const close = vi.spyOn(database, 'close');
    const read = withIndexedDbRecovery(database, operation);
    queueMicrotask(() => suspendIndexedDbRecovery(database)());

    await expect(read).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it('does not close a fresh connection opened before the recovery task runs', async () => {
    const failure = new DOMException('Connection lost', 'UnknownError');
    const operation = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue('stale');
    const close = vi.spyOn(database, 'close');
    const read = withIndexedDbRecovery(database, operation);
    const rejection = expect(read).rejects.toBe(failure);
    const opened = Promise.resolve().then(() => {
      database.close();
      return database.open();
    });

    await Promise.all([rejection, opened]);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(database.isOpen()).toBe(true);
  });

  it('keeps recovery suspended until every overlapping cleanup resumes', async () => {
    const resumeFirst = suspendIndexedDbRecovery(database);
    const resumeSecond = suspendIndexedDbRecovery(database);
    const failure = new DOMException('Connection lost', 'UnknownError');
    const operation = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue('recovered');
    const close = vi.spyOn(database, 'close');
    resumeFirst();
    await expect(withIndexedDbRecovery(database, operation)).rejects.toBe(failure);
    expect(close).not.toHaveBeenCalled();

    resumeSecond();
    operation.mockRejectedValueOnce(failure);
    await expect(withIndexedDbRecovery(database, operation)).resolves.toBe('recovered');
    expect(close).toHaveBeenCalledTimes(1);
  });
});
