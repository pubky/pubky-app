import Dexie, { type Table } from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isClosingForIndexedDbRecovery, suspendIndexedDbRecovery, withIndexedDbRecovery } from './franky.recovery';

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

  it('does not replace a reopened connection while a replay on it is unfinished', async () => {
    const failure = new DOMException('Connection lost', 'UnknownError');
    const replayFailure = new DOMException('Still lost', 'UnknownError');
    let rejectReplay: (error: unknown) => void = () => {};
    let markReplayStarted: () => void = () => {};
    const replayStarted = new Promise<void>((resolve) => (markReplayStarted = resolve));
    const slow = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockImplementationOnce(() => {
        markReplayStarted();
        return new Promise((_resolve, reject) => (rejectReplay = reject));
      });
    const fresh = vi.fn().mockRejectedValue(failure);
    const close = vi.spyOn(database, 'close');
    const schedule = vi.spyOn(Dexie, 'asap');

    const slowResult = expect(withIndexedDbRecovery(database, slow)).rejects.toBe(replayFailure);
    await replayStarted;
    // A fresh failure on the reopened connection must not reconnect past the pending replay.
    await expect(withIndexedDbRecovery(database, fresh)).rejects.toBe(failure);
    expect(fresh).toHaveBeenCalledTimes(1);

    rejectReplay(replayFailure);
    await slowResult;
    await expect(withIndexedDbRecovery(database, fresh)).rejects.toBe(failure);

    expect(fresh).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it('reconnects again from a reopened connection once its replays have succeeded', async () => {
    const failure = new DOMException('Connection lost', 'UnknownError');
    const operation = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce('first')
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce('second');
    const close = vi.spyOn(database, 'close');

    await expect(withIndexedDbRecovery(database, operation)).resolves.toBe('first');
    await expect(withIndexedDbRecovery(database, operation)).resolves.toBe('second');
    expect(close).toHaveBeenCalledTimes(2);
    expect(database.on('populate').subscribers).toHaveLength(0);
  });

  it.each([
    { name: 'constraint failure', failure: new DOMException('Duplicate row', 'ConstraintError') },
    {
      name: 'wrapped quota failure',
      failure: new Dexie.AbortError(new DOMException('Quota exceeded', 'QuotaExceededError')),
    },
    { name: 'application failure', failure: new TypeError('Invalid local transformation') },
  ])('allows a later reconnect after a replay ends with $name', async ({ failure: replayFailure }) => {
    const failure = new DOMException('Connection lost', 'UnknownError');
    const operation = vi.fn().mockRejectedValueOnce(failure).mockRejectedValueOnce(replayFailure);
    const close = vi.spyOn(database, 'close');

    await expect(withIndexedDbRecovery(database, operation)).rejects.toBe(replayFailure);
    expect(database.isOpen()).toBe(true);
    await rows.put({ id: 'saved' });
    const later = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockImplementation(() => rows.get('saved'));

    await expect(withIndexedDbRecovery(database, later)).resolves.toEqual({ id: 'saved' });
    expect(later).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('retains a connection-failure fence when another shared replay fails for a different reason', async () => {
    const failure = new DOMException('Connection lost', 'UnknownError');
    const applicationFailure = new TypeError('Invalid local transformation');
    const firstReplay = Promise.withResolvers<string>();
    const secondReplay = Promise.withResolvers<string>();
    const firstStarted = Promise.withResolvers<void>();
    const secondStarted = Promise.withResolvers<void>();
    const first = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockImplementationOnce(() => {
        firstStarted.resolve();
        return firstReplay.promise;
      });
    const second = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockImplementationOnce(() => {
        secondStarted.resolve();
        return secondReplay.promise;
      });
    const close = vi.spyOn(database, 'close');
    const firstResult = expect(withIndexedDbRecovery(database, first)).rejects.toBe(failure);
    const secondResult = expect(withIndexedDbRecovery(database, second)).rejects.toBe(applicationFailure);
    await Promise.all([firstStarted.promise, secondStarted.promise]);

    firstReplay.reject(failure);
    await firstResult;
    secondReplay.reject(applicationFailure);
    await secondResult;
    const later = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce('unexpected replay');
    await expect(withIndexedDbRecovery(database, later)).rejects.toBe(failure);
    expect(later).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('refuses to recreate a deleted database and leaves creation to initialization', async () => {
    await rows.put({ id: 'saved' });
    const populate = vi.fn();
    database.on('populate', populate);
    const closeOwnership: boolean[] = [];
    database.on('close', () => closeOwnership.push(isClosingForIndexedDbRecovery(database)));
    // Model a server-side deletion without the browser delivering versionchange.
    database.backendDB().onversionchange = null;
    const blocked = Promise.withResolvers<void>();
    const deleted = Promise.withResolvers<void>();
    const request = indexedDB.deleteDatabase(database.name);
    request.onblocked = () => blocked.resolve();
    request.onsuccess = () => deleted.resolve();
    request.onerror = () => deleted.reject(request.error);
    await blocked.promise;

    const failure = new DOMException('Database deleted by request of the user', 'UnknownError');
    const operation = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockImplementation(() => rows.get('saved'));
    await expect(withIndexedDbRecovery(database, operation)).rejects.toBe(failure);
    await deleted.promise;

    expect(operation).toHaveBeenCalledTimes(1);
    expect(populate).not.toHaveBeenCalled();
    expect(closeOwnership).toEqual([true, false]);
    expect(await Dexie.exists(database.name)).toBe(false);
    // AppDatabase.initialize() detects that absence and can now create normally.
    await database.open();
    expect(populate).toHaveBeenCalledTimes(1);
    expect(await rows.count()).toBe(0);
  });

  it('releases its creation guard before an unrelated failed-open close is observed', async () => {
    const populateCounts: number[] = [];
    database.on('close', () => populateCounts.push(database.on('populate').subscribers.length));
    const failure = new DOMException('Connection lost', 'UnknownError');
    const openFailure = new DOMException('Storage unavailable', 'NotReadableError');
    vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw openFailure;
    });
    const operation = vi.fn().mockRejectedValue(failure);

    await expect(withIndexedDbRecovery(database, operation)).rejects.toBe(failure);
    expect(failure).toHaveProperty('cause', openFailure);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(populateCounts).toEqual([1, 0]);
    expect(database.on('populate').subscribers).toHaveLength(0);
    await database.open();
    expect(database.isOpen()).toBe(true);
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

  it.each([
    {
      name: 'BulkError with sparse failed positions',
      create: () =>
        new Dexie.BulkError('Bulk write failed', {
          2: new DOMException('Connection lost', 'UnknownError'),
          7: new Dexie.AbortError('Transaction aborted'),
        }),
    },
    {
      name: 'ModifyError with a sparse failures array',
      create: () => {
        const failures: Error[] = [];
        failures[3] = new DOMException('Connection lost', 'UnknownError');
        return new Dexie.ModifyError('Modification failed', failures, 1, []);
      },
    },
    {
      name: 'AbortError wrapping a BulkError',
      create: () =>
        new Dexie.AbortError(
          new Dexie.BulkError('Bulk write failed', [
            new Dexie.AbortError(new DOMException('Connection lost', 'UnknownError')),
          ]),
        ),
    },
    {
      name: 'nested aggregates sharing the same failure',
      create: () => {
        const failure = new DOMException('Connection lost', 'UnknownError');
        const abort = new Dexie.AbortError(failure);
        return new Dexie.BulkError('Bulk write failed', [
          new Dexie.ModifyError('Modification failed', [failure, abort], 0, []),
          abort,
          failure,
        ]);
      },
    },
  ])('recovers a transaction rejected with $name', async ({ create }) => {
    const operation = vi.fn().mockRejectedValueOnce(create()).mockResolvedValueOnce('recovered');
    const close = vi.spyOn(database, 'close');

    await expect(withIndexedDbRecovery(database, operation)).resolves.toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
  });

  describe.each([
    { name: 'BulkError', create: (failures: Error[]) => new Dexie.BulkError('Bulk write failed', failures) },
    {
      name: 'ModifyError',
      create: (failures: Error[]) => new Dexie.ModifyError('Modification failed', failures, 1, []),
    },
  ])('$name classification', ({ create }) => {
    it.each([
      { name: 'constraint', failure: new DOMException('Duplicate row', 'ConstraintError') },
      { name: 'quota', failure: new Dexie.AbortError(new DOMException('Quota exceeded', 'QuotaExceededError')) },
      { name: 'programming', failure: new TypeError('Invalid local transformation') },
    ])('does not recover a mixture of connection and $name failures', async ({ failure }) => {
      const aggregate = create([new DOMException('Connection lost', 'UnknownError'), failure]);
      const operation = vi.fn().mockRejectedValue(aggregate);
      const close = vi.spyOn(database, 'close');

      await expect(withIndexedDbRecovery(database, operation)).rejects.toBe(aggregate);
      expect(operation).toHaveBeenCalledTimes(1);
      expect(close).not.toHaveBeenCalled();
    });

    it('never recovers an empty failure list', async () => {
      const aggregate = create([]);
      const operation = vi.fn().mockRejectedValue(aggregate);
      const close = vi.spyOn(database, 'close');

      await expect(withIndexedDbRecovery(database, operation)).rejects.toBe(aggregate);
      expect(operation).toHaveBeenCalledTimes(1);
      expect(close).not.toHaveBeenCalled();
    });

    it('retains the one-replay bound when connection failures persist', async () => {
      const aggregate = create([new DOMException('Connection lost', 'UnknownError')]);
      const operation = vi.fn().mockRejectedValue(aggregate);
      const close = vi.spyOn(database, 'close');

      await expect(withIndexedDbRecovery(database, operation)).rejects.toBe(aggregate);
      await expect(withIndexedDbRecovery(database, operation)).rejects.toBe(aggregate);
      expect(operation).toHaveBeenCalledTimes(3);
      expect(close).toHaveBeenCalledTimes(1);
    });
  });

  it.each([
    {
      name: 'an all-hole ModifyError failure list',
      create: () => new Dexie.ModifyError('Modification failed', new Array<Error>(3), 0, []),
    },
    {
      name: 'a malformed BulkError failure list',
      create: () => Object.defineProperty(new Dexie.BulkError('Bulk write failed', []), 'failures', { value: null }),
    },
    {
      name: 'a name-only BulkError lookalike',
      create: () =>
        Object.assign(new Error('Bulk write failed'), {
          name: 'BulkError',
          failures: [new DOMException('Connection lost', 'UnknownError')],
        }),
    },
    {
      name: 'a generic AggregateError',
      create: () => new AggregateError([new DOMException('Connection lost', 'UnknownError')]),
    },
    {
      name: 'a self-referencing aggregate',
      create: () => {
        const aggregate = new Dexie.BulkError('Bulk write failed', []);
        aggregate.failures.push(aggregate);
        return aggregate;
      },
    },
    {
      name: 'a cycle through AbortError.inner',
      create: () => {
        const aggregate = new Dexie.ModifyError('Modification failed', [], 0, []);
        aggregate.failures.push(new Dexie.AbortError(aggregate));
        return aggregate;
      },
    },
  ])('rejects $name without reconnecting', async ({ create }) => {
    const failure = create();
    const operation = vi.fn().mockRejectedValue(failure);
    const close = vi.spyOn(database, 'close');

    await expect(withIndexedDbRecovery(database, operation)).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it('retains the original operation error when reopening fails', async () => {
    const failure = new DOMException('Connection lost', 'UnknownError');
    const openFailure = new DOMException('Reopen failed', 'UnknownError');
    const operation = vi.fn().mockRejectedValue(failure);
    vi.spyOn(database, 'open').mockRejectedValueOnce(openFailure);

    await expect(withIndexedDbRecovery(database, operation)).rejects.toBe(failure);
    expect(failure).toMatchObject({ cause: { name: 'UnknownError', inner: openFailure } });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(database.on('populate').subscribers).toHaveLength(0);
  });

  it.each(['close', 'open'] as const)('releases its creation guard when %s throws synchronously', async (method) => {
    const failure = new DOMException('Connection lost', 'UnknownError');
    const transitionFailure = new TypeError('Connection transition failed');
    vi.spyOn(database, method).mockImplementationOnce(() => {
      throw transitionFailure;
    });
    const operation = vi.fn().mockRejectedValue(failure);

    await expect(withIndexedDbRecovery(database, operation)).rejects.toBe(failure);
    expect(failure).toHaveProperty('cause', transitionFailure);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(isClosingForIndexedDbRecovery(database)).toBe(false);
    expect(database.on('populate').subscribers).toHaveLength(0);
  });

  it('lets a caller transaction scheduled beside a failing read commit', async () => {
    const failure = new DOMException('Connection lost', 'UnknownError');
    const operation = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockImplementation(() => rows.get('saved'));
    const read = withIndexedDbRecovery(database, operation);
    // This microtask admits the caller transaction before its native transaction
    // is created; a microtask-only reconnect closes the connection in that gap.
    const write = Promise.resolve().then(() => database.transaction('rw', rows, () => rows.put({ id: 'saved' })));

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
