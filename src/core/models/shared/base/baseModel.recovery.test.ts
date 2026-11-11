import Dexie, { liveQuery, type Table } from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelBase } from './baseModel';

interface Row {
  id: string;
  name: string;
}

class RecoveryModel extends ModelBase<string, Row> implements Row {
  static table: Table<Row>;
  name: string;

  constructor(row: Row) {
    super(row);
    this.name = row.name;
  }
}

describe('model read connection recovery', () => {
  let database: Dexie;

  beforeEach(async () => {
    database = new Dexie('model-read-recovery');
    database.version(1).stores({ rows: 'id' });
    await database.open();
    RecoveryModel.table = database.table<Row>('rows');
    await RecoveryModel.table.put({ id: 'alice', name: 'Alice Example' });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await database.delete();
  });

  const reads = [
    { name: 'findById', run: () => RecoveryModel.findById('alice'), expected: { id: 'alice', name: 'Alice Example' } },
    {
      name: 'findByIds',
      run: () => RecoveryModel.findByIds(['alice']),
      expected: [{ id: 'alice', name: 'Alice Example' }],
    },
    {
      name: 'findByIdsPreserveOrder',
      run: () => RecoveryModel.findByIdsPreserveOrder(['missing', 'alice']),
      expected: [undefined, { id: 'alice', name: 'Alice Example' }],
    },
    { name: 'exists', run: () => RecoveryModel.exists('alice'), expected: true },
  ];

  it.each(reads)('reopens and completes $name after an IndexedDB UnknownError', async ({ run, expected }) => {
    const connection = database.backendDB();
    vi.spyOn(database.core, 'transaction').mockImplementationOnce(() => {
      throw new DOMException(
        'Attempt to get a record from database without an in-progress transaction',
        'UnknownError',
      );
    });

    await expect(run()).resolves.toEqual(expected);
    expect(database.backendDB()).not.toBe(connection);
    expect(await RecoveryModel.table.count()).toBe(1);
  });

  it('keeps a recovered live query subscribed to subsequent writes', async () => {
    vi.spyOn(database.core, 'transaction').mockImplementationOnce(() => {
      throw new DOMException('The operation was aborted.', 'AbortError');
    });
    const values: (string | undefined)[] = [];
    const errors: unknown[] = [];
    const subscription = liveQuery(async () => (await RecoveryModel.findById('alice'))?.name).subscribe({
      next: (value) => values.push(value),
      error: (error: unknown) => errors.push(error),
    });

    try {
      await vi.waitFor(() => expect(values).toEqual(['Alice Example']));
      await RecoveryModel.table.put({ id: 'alice', name: 'Bob Example' });
      await vi.waitFor(() => expect(values).toEqual(['Alice Example', 'Bob Example']));
      expect(errors).toEqual([]);
    } finally {
      subscription.unsubscribe();
    }
  });
  it('stops after one reconnect when the fresh connection fails too', async () => {
    const failure = new DOMException('No live transaction', 'UnknownError');
    const get = vi.spyOn(RecoveryModel.table, 'get').mockRejectedValue(failure);
    const close = vi.spyOn(database, 'close');
    await expect(RecoveryModel.findById('alice')).rejects.toMatchObject({ cause: failure });
    expect(get).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it.each([
    'ConstraintError',
    'DataError',
    'QuotaExceededError',
    'DatabaseClosedError',
    'TransactionInactiveError',
    'Error',
  ])('does not reconnect for %s, even when the message resembles WebKit', async (name) => {
    const failure = new DOMException('connection to indexed database server lost', name);
    const get = vi.spyOn(RecoveryModel.table, 'get').mockRejectedValueOnce(failure);
    const close = vi.spyOn(database, 'close');
    await expect(RecoveryModel.findById('alice')).rejects.toMatchObject({ cause: failure });
    expect(get).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it('coalesces concurrent failures, including one rejected after reconnect completes', async () => {
    const first = Promise.withResolvers<Row | undefined>();
    const second = Promise.withResolvers<Row | undefined>();
    vi.spyOn(RecoveryModel.table, 'get')
      .mockReturnValueOnce(Dexie.Promise.resolve(first.promise))
      .mockReturnValueOnce(Dexie.Promise.resolve(second.promise));
    const close = vi.spyOn(database, 'close');
    const one = RecoveryModel.findById('alice');
    const two = RecoveryModel.findById('alice');
    first.reject(new DOMException('No live transaction', 'UnknownError'));
    await expect(one).resolves.toMatchObject({ name: 'Alice Example' });
    second.reject(new DOMException('Transaction aborted', 'AbortError'));
    await expect(two).resolves.toMatchObject({ name: 'Alice Example' });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('does not replay a read inside an existing transaction or commit its partial writes', async () => {
    const failure = new DOMException('Transaction aborted', 'AbortError');
    const get = vi.spyOn(RecoveryModel.table, 'get').mockRejectedValueOnce(failure);
    const close = vi.spyOn(database, 'close');
    const transaction = database.transaction('rw', RecoveryModel.table, async () => {
      await RecoveryModel.table.put({ id: 'bob', name: 'Bob Example' });
      return RecoveryModel.findById('alice');
    });
    await expect(transaction).rejects.toMatchObject({ cause: failure });
    expect(await RecoveryModel.table.get('bob')).toBeUndefined();
    expect(get).toHaveBeenCalledTimes(2);
    expect(close).not.toHaveBeenCalled();
  });

  it.each(['close', 'delete', 'versionchange'] as const)(
    'does not revive work after %s, even if the database is opened again',
    async (action) => {
      const pending = Promise.withResolvers<Row | undefined>();
      const get = vi.spyOn(RecoveryModel.table, 'get').mockReturnValueOnce(Dexie.Promise.resolve(pending.promise));
      const read = RecoveryModel.findById('alice');
      if (action === 'close') {
        database.close();
        await database.open();
      } else if (action === 'delete') {
        await database.delete();
        await database.open();
      } else {
        const newer = new Dexie(database.name);
        newer.version(2).stores({ rows: 'id' });
        await newer.open();
        newer.close();
      }
      const failure = new DOMException('No live transaction', 'UnknownError');
      pending.reject(failure);
      await expect(read).rejects.toMatchObject({ cause: failure });
      expect(get).toHaveBeenCalledTimes(1);
    },
  );
});
