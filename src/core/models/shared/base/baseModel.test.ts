import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie, { Table, UpdateSpec } from 'dexie';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { ModelBase } from './baseModel';
import { AppError } from '@/libs/error/error';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';

interface TestSchema {
  id: string;
  name: string;
  count?: number;
}

class TestBaseModel extends ModelBase<string, TestSchema> implements TestSchema {
  static table: Table<TestSchema>;
  id!: string;
  name!: string;
  count?: number;

  constructor(data: TestSchema) {
    super(data);
    this.name = data.name;
    this.count = data.count;
  }
}

describe('DexieModelBase (shared CRUD/query)', () => {
  let db: Dexie;

  beforeEach(async () => {
    // Isolated in-memory IndexedDB per test
    globalThis.indexedDB = indexedDB;
    globalThis.IDBKeyRange = IDBKeyRange;

    db = new Dexie('dexie-model-base-test');
    db.version(1).stores({ base_records: 'id' });
    await db.open();

    TestBaseModel.table = db.table<TestSchema>('base_records');
    await TestBaseModel.table.clear();
  });

  it('create inserts a new record (add)', async () => {
    await TestBaseModel.create({ id: '1', name: 'alpha' });
    const stored = await TestBaseModel.table.get('1');
    expect(stored).toEqual({ id: '1', name: 'alpha' });
  });

  it('upsert inserts or replaces a record (put)', async () => {
    await TestBaseModel.upsert({ id: '2', name: 'beta', count: 1 });
    await TestBaseModel.upsert({ id: '2', name: 'beta-updated' });
    const stored = await TestBaseModel.table.get('2');
    expect(stored).toEqual({ id: '2', name: 'beta-updated' });
  });

  it('update applies partial changes and returns modified count', async () => {
    await TestBaseModel.create({ id: '3', name: 'gamma', count: 0 });
    const modified = await TestBaseModel.update('3', { count: 2 } as UpdateSpec<TestSchema>);
    expect(modified).toBe(1);
    const stored = await TestBaseModel.table.get('3');
    expect(stored).toEqual({ id: '3', name: 'gamma', count: 2 });
  });

  it('update returns 0 when record not found', async () => {
    const modified = await TestBaseModel.update('999', { name: 'missing' } as UpdateSpec<TestSchema>);
    expect(modified).toBe(0);
  });

  it('findById returns model instance or null', async () => {
    await TestBaseModel.create({ id: '4', name: 'delta' });
    const found = await TestBaseModel.findById('4');
    expect(found).toBeInstanceOf(TestBaseModel);
    expect(found?.id).toBe('4');
    expect(found?.name).toBe('delta');

    const notFound = await TestBaseModel.findById('404');
    expect(notFound).toBeNull();
  });

  it('findByIds returns only existing records (no nulls, order not guaranteed)', async () => {
    await TestBaseModel.upsert({ id: '10', name: 'a' });
    await TestBaseModel.upsert({ id: '11', name: 'b' });
    const results = await TestBaseModel.findByIds(['9', '10', '11', '12']);
    const ids = results.map((r) => r.id).sort();
    expect(ids).toEqual(['10', '11']);
  });

  it('findByIdsPreserveOrder preserves order and includes nulls for missing', async () => {
    await TestBaseModel.upsert({ id: '20', name: 'x' });
    await TestBaseModel.upsert({ id: '22', name: 'z' });
    const results = await TestBaseModel.findByIdsPreserveOrder(['20', '21', '22']);
    expect(results.length).toBe(3);
    expect(results[0]).toEqual({ id: '20', name: 'x' });
    expect(results[1]).toBeUndefined();
    expect(results[2]).toEqual({ id: '22', name: 'z' });
  });

  it('exists returns true/false by id', async () => {
    await TestBaseModel.create({ id: '60', name: 'exists' });
    expect(await TestBaseModel.exists('60')).toBe(true);
    expect(await TestBaseModel.exists('61')).toBe(false);
  });

  it('deleteById removes a record', async () => {
    await TestBaseModel.create({ id: '70', name: 'to-delete' });
    expect(await TestBaseModel.exists('70')).toBe(true);
    await TestBaseModel.deleteById('70');
    expect(await TestBaseModel.exists('70')).toBe(false);
  });

  it('deleteById is idempotent (no error if not found)', async () => {
    await expect(TestBaseModel.deleteById('non-existent')).resolves.toBeUndefined();
  });

  it('clear removes all records', async () => {
    await TestBaseModel.create({ id: '80', name: 'a' });
    await TestBaseModel.create({ id: '81', name: 'b' });
    expect(await TestBaseModel.table.count()).toBe(2);
    await TestBaseModel.clear();
    expect(await TestBaseModel.table.count()).toBe(0);
  });
});

describe('DexieModelBase error handling', () => {
  let db: Dexie;

  beforeEach(async () => {
    globalThis.indexedDB = indexedDB;
    globalThis.IDBKeyRange = IDBKeyRange;

    db = new Dexie('dexie-model-base-error-test');
    db.version(1).stores({ base_records: 'id' });
    await db.open();

    TestBaseModel.table = db.table<TestSchema>('base_records');
    await TestBaseModel.table.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('create throws WRITE_FAILED with correct context on failure', async () => {
    vi.spyOn(TestBaseModel.table, 'add').mockRejectedValueOnce(new Error('DB write error'));

    try {
      await TestBaseModel.create({ id: '1', name: 'test' });
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.category).toBe(ErrorCategory.Database);
      expect(appError.code).toBe(DatabaseErrorCode.WRITE_FAILED);
      expect(appError.service).toBe(ErrorService.Local);
      expect(appError.operation).toBe('create');
      expect(appError.context).toMatchObject({ table: 'base_records', id: '1' });
      expect(appError.cause).toBeInstanceOf(Error);
    }
  });

  it('upsert throws WRITE_FAILED with correct context on failure', async () => {
    vi.spyOn(TestBaseModel.table, 'put').mockRejectedValueOnce(new Error('DB write error'));

    try {
      await TestBaseModel.upsert({ id: '2', name: 'test' });
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.category).toBe(ErrorCategory.Database);
      expect(appError.code).toBe(DatabaseErrorCode.WRITE_FAILED);
      expect(appError.service).toBe(ErrorService.Local);
      expect(appError.operation).toBe('upsert');
      expect(appError.context).toMatchObject({ table: 'base_records', id: '2' });
    }
  });

  it('update throws WRITE_FAILED with correct context on failure', async () => {
    vi.spyOn(TestBaseModel.table, 'update').mockRejectedValueOnce(new Error('DB write error'));

    try {
      await TestBaseModel.update('3', { name: 'updated' } as UpdateSpec<TestSchema>);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.category).toBe(ErrorCategory.Database);
      expect(appError.code).toBe(DatabaseErrorCode.WRITE_FAILED);
      expect(appError.service).toBe(ErrorService.Local);
      expect(appError.operation).toBe('update');
      expect(appError.context).toMatchObject({ table: 'base_records', id: '3' });
    }
  });

  it('findById throws QUERY_FAILED with correct context on failure', async () => {
    vi.spyOn(TestBaseModel.table, 'get').mockRejectedValueOnce(new Error('DB read error'));

    try {
      await TestBaseModel.findById('4');
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.category).toBe(ErrorCategory.Database);
      expect(appError.code).toBe(DatabaseErrorCode.QUERY_FAILED);
      expect(appError.service).toBe(ErrorService.Local);
      expect(appError.operation).toBe('findById');
      expect(appError.context).toMatchObject({ table: 'base_records', id: '4' });
    }
  });

  it('findByIds throws QUERY_FAILED with correct context on failure', async () => {
    const mockWhere = {
      anyOf: vi.fn().mockReturnValue({
        toArray: vi.fn().mockRejectedValueOnce(new Error('DB read error')),
      }),
    };
    vi.spyOn(TestBaseModel.table, 'where').mockReturnValue(mockWhere as never);

    try {
      await TestBaseModel.findByIds(['5', '6']);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.category).toBe(ErrorCategory.Database);
      expect(appError.code).toBe(DatabaseErrorCode.QUERY_FAILED);
      expect(appError.service).toBe(ErrorService.Local);
      expect(appError.operation).toBe('findByIds');
      expect(appError.context).toMatchObject({ table: 'base_records', count: 2 });
    }
  });

  it('findByIdsPreserveOrder throws QUERY_FAILED with correct context on failure', async () => {
    vi.spyOn(TestBaseModel.table, 'bulkGet').mockRejectedValueOnce(new Error('DB read error'));

    try {
      await TestBaseModel.findByIdsPreserveOrder(['7', '8']);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.category).toBe(ErrorCategory.Database);
      expect(appError.code).toBe(DatabaseErrorCode.QUERY_FAILED);
      expect(appError.service).toBe(ErrorService.Local);
      expect(appError.operation).toBe('findByIdsPreserveOrder');
      expect(appError.context).toMatchObject({ table: 'base_records', count: 2 });
    }
  });

  it('exists throws QUERY_FAILED with correct context on failure', async () => {
    const mockWhere = {
      equals: vi.fn().mockReturnValue({
        count: vi.fn().mockRejectedValueOnce(new Error('DB read error')),
      }),
    };
    vi.spyOn(TestBaseModel.table, 'where').mockReturnValue(mockWhere as never);

    try {
      await TestBaseModel.exists('9');
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.category).toBe(ErrorCategory.Database);
      expect(appError.code).toBe(DatabaseErrorCode.QUERY_FAILED);
      expect(appError.service).toBe(ErrorService.Local);
      expect(appError.operation).toBe('exists');
      expect(appError.context).toMatchObject({ table: 'base_records', id: '9' });
    }
  });

  it('deleteById throws DELETE_FAILED with correct context on failure', async () => {
    vi.spyOn(TestBaseModel.table, 'delete').mockRejectedValueOnce(new Error('DB delete error'));

    try {
      await TestBaseModel.deleteById('10');
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.category).toBe(ErrorCategory.Database);
      expect(appError.code).toBe(DatabaseErrorCode.DELETE_FAILED);
      expect(appError.service).toBe(ErrorService.Local);
      expect(appError.operation).toBe('deleteById');
      expect(appError.context).toMatchObject({ table: 'base_records', id: '10' });
    }
  });

  it('clear throws DELETE_FAILED with correct context on failure', async () => {
    vi.spyOn(TestBaseModel.table, 'clear').mockRejectedValueOnce(new Error('DB delete error'));

    try {
      await TestBaseModel.clear();
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.category).toBe(ErrorCategory.Database);
      expect(appError.code).toBe(DatabaseErrorCode.DELETE_FAILED);
      expect(appError.service).toBe(ErrorService.Local);
      expect(appError.operation).toBe('clear');
      expect(appError.context).toMatchObject({ table: 'base_records' });
    }
  });
});
