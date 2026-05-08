import Dexie, { Table } from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/libs/error/error';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { TupleModelBase } from './baseTuple';

interface TestTupleSchema {
  id: string;
  value: string;
  count?: number;
}

type TestTuple = [id: string, data: Omit<TestTupleSchema, 'id'>];

class TestTupleModel extends TupleModelBase<string, TestTupleSchema> implements TestTupleSchema {
  static table: Table<TestTupleSchema>;
  id!: string;
  value!: string;
  count?: number;

  constructor(data: TestTupleSchema) {
    super(data);
    this.value = data.value;
    this.count = data.count;
  }

  static toSchema(tuple: TestTuple): TestTupleSchema {
    const [id, data] = tuple;
    return { id, ...data };
  }
}

describe('TupleModelBase', () => {
  let db: Dexie;

  beforeEach(async () => {
    // Setup isolated in-memory IndexedDB per test
    globalThis.indexedDB = indexedDB;
    globalThis.IDBKeyRange = IDBKeyRange;

    db = new Dexie('tuple-model-base-test');
    db.version(1).stores({ test_tuples: 'id' });
    await db.open();

    TestTupleModel.table = db.table<TestTupleSchema>('test_tuples');
    await TestTupleModel.table.clear();
  });

  // Keep only bulkSave-specific coverage; shared CRUD lives in baseModel.test.ts
  it('bulkSave converts tuples via toSchema and upserts', async () => {
    await TestTupleModel.bulkSave([
      ['40', { value: 'first' }],
      ['41', { value: 'second' }],
    ]);
    await TestTupleModel.bulkSave([
      ['41', { value: 'second-updated' }],
      ['42', { value: 'third' }],
    ]);
    const all = await TestTupleModel.table.toArray();
    const byId = new Map(all.map((r) => [r.id, r]));
    expect(byId.get('40')).toEqual({ id: '40', value: 'first' });
    expect(byId.get('41')).toEqual({ id: '41', value: 'second-updated' });
    expect(byId.get('42')).toEqual({ id: '42', value: 'third' });
  });
});

describe('TupleModelBase error handling', () => {
  let db: Dexie;

  beforeEach(async () => {
    globalThis.indexedDB = indexedDB;
    globalThis.IDBKeyRange = IDBKeyRange;

    db = new Dexie('tuple-model-base-error-test');
    db.version(1).stores({ test_tuples: 'id' });
    await db.open();

    TestTupleModel.table = db.table<TestTupleSchema>('test_tuples');
    await TestTupleModel.table.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('bulkSave throws WRITE_FAILED with correct context on failure', async () => {
    vi.spyOn(TestTupleModel.table, 'bulkPut').mockRejectedValueOnce(new Error('DB bulk write error'));

    try {
      await TestTupleModel.bulkSave([
        ['1', { value: 'a' }],
        ['2', { value: 'b' }],
        ['3', { value: 'c' }],
      ]);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.category).toBe(ErrorCategory.Database);
      expect(appError.code).toBe(DatabaseErrorCode.WRITE_FAILED);
      expect(appError.service).toBe(ErrorService.Local);
      expect(appError.operation).toBe('bulkSave');
      expect(appError.context).toMatchObject({ table: 'test_tuples', count: 3 });
      expect(appError.cause).toBeInstanceOf(Error);
    }
  });
});
