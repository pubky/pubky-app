import Dexie, { Table } from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/libs/error/error';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import type { NexusModelTuple } from '@/models/shared/base/tuple/baseTuple.type';
import type { TtlModelSchema } from '@/models/shared/ttl/ttl.schema';
import { Ttl } from './ttl';

type TestTtlSchema = TtlModelSchema<string>;

type TestTtlTuple = NexusModelTuple<Pick<TestTtlSchema, 'lastUpdatedAt'>>;

class TestTtlModel extends Ttl<string, TestTtlSchema> implements TestTtlSchema {
  static table: Table<TestTtlSchema>;
  id: string;
  lastUpdatedAt: number;

  constructor(data: TestTtlSchema) {
    super(data);
    this.id = data.id;
    this.lastUpdatedAt = data.lastUpdatedAt;
  }
}

describe('Ttl', () => {
  let db: Dexie;

  beforeEach(async () => {
    globalThis.indexedDB = indexedDB;
    globalThis.IDBKeyRange = IDBKeyRange;

    db = new Dexie('ttl-model-test');
    db.version(1).stores({ test_ttl: 'id' });
    await db.open();

    TestTtlModel.table = db.table<TestTtlSchema>('test_ttl');
    await TestTtlModel.table.clear();
  });

  it('bulkSave upserts multiple TTL records from tuples', async () => {
    const now = Date.now();
    const tuples: TestTtlTuple[] = [
      ['id1', { lastUpdatedAt: now }],
      ['id2', { lastUpdatedAt: now + 1000 }],
    ];

    await TestTtlModel.bulkSave(tuples);

    const all = await TestTtlModel.table.toArray();
    const byId = new Map(all.map((r) => [r.id, r]));

    expect(byId.get('id1')?.lastUpdatedAt).toBe(now);
    expect(byId.get('id2')?.lastUpdatedAt).toBe(now + 1000);
  });

  it('bulkSave updates existing records', async () => {
    const now = Date.now();
    await TestTtlModel.bulkSave([['id1', { lastUpdatedAt: now }]]);
    await TestTtlModel.bulkSave([['id1', { lastUpdatedAt: now + 5000 }]]);

    const stored = await TestTtlModel.table.get('id1');
    expect(stored?.lastUpdatedAt).toBe(now + 5000);
  });
});

describe('Ttl error handling', () => {
  let db: Dexie;

  beforeEach(async () => {
    globalThis.indexedDB = indexedDB;
    globalThis.IDBKeyRange = IDBKeyRange;

    db = new Dexie('ttl-model-error-test');
    db.version(1).stores({ test_ttl: 'id' });
    await db.open();

    TestTtlModel.table = db.table<TestTtlSchema>('test_ttl');
    await TestTtlModel.table.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('bulkSave throws WRITE_FAILED with correct context on failure', async () => {
    vi.spyOn(TestTtlModel.table, 'bulkPut').mockRejectedValueOnce(new Error('DB error'));

    const tuples: TestTtlTuple[] = [
      ['id1', { lastUpdatedAt: Date.now() }],
      ['id2', { lastUpdatedAt: Date.now() }],
      ['id3', { lastUpdatedAt: Date.now() }],
    ];

    try {
      await TestTtlModel.bulkSave(tuples);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.category).toBe(ErrorCategory.Database);
      expect(appError.code).toBe(DatabaseErrorCode.WRITE_FAILED);
      expect(appError.service).toBe(ErrorService.Local);
      expect(appError.operation).toBe('bulkSave');
      expect(appError.context).toMatchObject({ table: 'test_ttl', count: 3 });
      expect(appError.cause).toBeInstanceOf(Error);
    }
  });
});
