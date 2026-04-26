import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie, { Table } from 'dexie';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { BaseStreamModel } from './stream';
import { AppError } from '@/libs/error/error';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';

type TestItem = string;

interface TestStreamSchema {
  id: string;
  stream: TestItem[];
}

class TestStreamModel extends BaseStreamModel<string, TestItem, TestStreamSchema> implements TestStreamSchema {
  static table: Table<TestStreamSchema>;
  id: string;
  stream: TestItem[];

  constructor(data: TestStreamSchema) {
    super(data);
    this.id = data.id;
    this.stream = data.stream;
  }
}

describe('BaseStreamModel', () => {
  let db: Dexie;

  beforeEach(async () => {
    globalThis.indexedDB = indexedDB;
    globalThis.IDBKeyRange = IDBKeyRange;

    db = new Dexie('stream-model-test');
    db.version(1).stores({ test_streams: 'id' });
    await db.open();

    TestStreamModel.table = db.table<TestStreamSchema>('test_streams');
    await TestStreamModel.table.clear();
  });

  it('create inserts a new stream', async () => {
    await TestStreamModel.create('s1', ['a', 'b']);
    expect(await TestStreamModel.table.get('s1')).toEqual({ id: 's1', stream: ['a', 'b'] });
  });

  it('create fails when stream already exists', async () => {
    await TestStreamModel.create('s1', ['a']);
    await expect(TestStreamModel.create('s1', ['b'])).rejects.toThrow();
  });

  it('upsert inserts or replaces a stream', async () => {
    await TestStreamModel.upsert('s1', ['a', 'b']);
    await TestStreamModel.upsert('s1', ['c', 'd']);
    expect(await TestStreamModel.table.get('s1')).toEqual({ id: 's1', stream: ['c', 'd'] });
  });

  it('findById returns model or null', async () => {
    await TestStreamModel.upsert('s1', ['x']);
    const found = await TestStreamModel.findById('s1');
    expect(found).toBeInstanceOf(TestStreamModel);
    expect(found?.id).toBe('s1');
    expect(found?.stream).toEqual(['x']);

    expect(await TestStreamModel.findById('missing')).toBeNull();
  });

  it('deleteById removes the stream', async () => {
    await TestStreamModel.upsert('s1', ['z']);
    await TestStreamModel.deleteById('s1');
    expect(await TestStreamModel.table.get('s1')).toBeUndefined();
  });

  it('clear removes all streams', async () => {
    await TestStreamModel.upsert('s1', ['a']);
    await TestStreamModel.upsert('s2', ['b']);
    await TestStreamModel.clear();
    expect(await TestStreamModel.table.toArray()).toEqual([]);
  });

  describe('getStreamHead', () => {
    it('returns first item when stream has items', async () => {
      await TestStreamModel.upsert('s1', ['first', 'second']);
      expect(await TestStreamModel.getStreamHead('s1')).toBe('first');
    });

    it('returns null when stream missing or empty', async () => {
      expect(await TestStreamModel.getStreamHead('missing')).toBeNull();
      // @ts-expect-error - TypeScript inference issue with generic static methods
      await TestStreamModel.upsert('s1', []);
      expect(await TestStreamModel.getStreamHead('s1')).toBeNull();
    });
  });

  describe('prependItems', () => {
    it('adds items to head and filters duplicates', async () => {
      await TestStreamModel.upsert('s1', ['existing']);
      // @ts-expect-error - TypeScript inference issue with generic static methods
      await TestStreamModel.prependItems('s1', ['new', 'existing', 'another']);
      expect((await TestStreamModel.table.get('s1'))?.stream).toEqual(['new', 'another', 'existing']);
    });

    it('creates stream if missing', async () => {
      // @ts-expect-error - TypeScript inference issue with generic static methods
      await TestStreamModel.prependItems('s1', ['a', 'b']);
      expect((await TestStreamModel.table.get('s1'))?.stream).toEqual(['a', 'b']);
    });

    it('handles empty or all-duplicate items', async () => {
      await TestStreamModel.upsert('s1', ['a', 'b']);
      // @ts-expect-error - TypeScript inference issue with generic static methods
      await TestStreamModel.prependItems('s1', []);
      expect((await TestStreamModel.table.get('s1'))?.stream).toEqual(['a', 'b']);

      // @ts-expect-error - TypeScript inference issue with generic static methods
      await TestStreamModel.prependItems('s1', ['a', 'b']);
      expect((await TestStreamModel.table.get('s1'))?.stream).toEqual(['a', 'b']);
    });
  });

  describe('removeItems', () => {
    it('removes specified items', async () => {
      await TestStreamModel.upsert('s1', ['a', 'b', 'c', 'd']);
      await TestStreamModel.removeItems('s1', ['b', 'd']);
      expect((await TestStreamModel.table.get('s1'))?.stream).toEqual(['a', 'c']);
    });

    it('silently succeeds when stream missing', async () => {
      await expect(TestStreamModel.removeItems('missing', ['a'])).resolves.not.toThrow();
    });

    it('handles missing items or empty array', async () => {
      await TestStreamModel.upsert('s1', ['a', 'b']);
      await TestStreamModel.removeItems('s1', ['c']);
      expect((await TestStreamModel.table.get('s1'))?.stream).toEqual(['a', 'b']);

      // @ts-expect-error - TypeScript inference issue with generic static methods
      await TestStreamModel.removeItems('s1', []);
      expect((await TestStreamModel.table.get('s1'))?.stream).toEqual(['a', 'b']);
    });
  });
});

describe('BaseStreamModel error handling', () => {
  let db: Dexie;

  beforeEach(async () => {
    globalThis.indexedDB = indexedDB;
    globalThis.IDBKeyRange = IDBKeyRange;

    db = new Dexie('stream-model-error-test');
    db.version(1).stores({ test_streams: 'id' });
    await db.open();

    TestStreamModel.table = db.table<TestStreamSchema>('test_streams');
    await TestStreamModel.table.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('create throws WRITE_FAILED with correct context on failure', async () => {
    vi.spyOn(TestStreamModel.table, 'add').mockRejectedValueOnce(new Error('DB error'));

    try {
      await TestStreamModel.create('s1', ['a']);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.category).toBe(ErrorCategory.Database);
      expect(appError.code).toBe(DatabaseErrorCode.WRITE_FAILED);
      expect(appError.service).toBe(ErrorService.Local);
      expect(appError.operation).toBe('create');
      expect(appError.context).toMatchObject({ table: 'test_streams', id: 's1', streamLength: 1 });
    }
  });

  it('upsert throws WRITE_FAILED with correct context on failure', async () => {
    vi.spyOn(TestStreamModel.table, 'put').mockRejectedValueOnce(new Error('DB error'));

    try {
      await TestStreamModel.upsert('s1', ['a', 'b']);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.category).toBe(ErrorCategory.Database);
      expect(appError.code).toBe(DatabaseErrorCode.WRITE_FAILED);
      expect(appError.service).toBe(ErrorService.Local);
      expect(appError.operation).toBe('upsert');
      expect(appError.context).toMatchObject({ table: 'test_streams', id: 's1', streamLength: 2 });
    }
  });

  it('findById throws QUERY_FAILED with correct context on failure', async () => {
    vi.spyOn(TestStreamModel.table, 'get').mockRejectedValueOnce(new Error('DB error'));

    try {
      await TestStreamModel.findById('s1');
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.category).toBe(ErrorCategory.Database);
      expect(appError.code).toBe(DatabaseErrorCode.QUERY_FAILED);
      expect(appError.service).toBe(ErrorService.Local);
      expect(appError.operation).toBe('findById');
      expect(appError.context).toMatchObject({ table: 'test_streams', id: 's1' });
    }
  });

  it('deleteById throws DELETE_FAILED with correct context on failure', async () => {
    vi.spyOn(TestStreamModel.table, 'delete').mockRejectedValueOnce(new Error('DB error'));

    try {
      await TestStreamModel.deleteById('s1');
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.category).toBe(ErrorCategory.Database);
      expect(appError.code).toBe(DatabaseErrorCode.DELETE_FAILED);
      expect(appError.service).toBe(ErrorService.Local);
      expect(appError.operation).toBe('deleteById');
      expect(appError.context).toMatchObject({ table: 'test_streams', id: 's1' });
    }
  });

  it('clear throws DELETE_FAILED with correct context on failure', async () => {
    vi.spyOn(TestStreamModel.table, 'clear').mockRejectedValueOnce(new Error('DB error'));

    try {
      await TestStreamModel.clear();
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.category).toBe(ErrorCategory.Database);
      expect(appError.code).toBe(DatabaseErrorCode.DELETE_FAILED);
      expect(appError.service).toBe(ErrorService.Local);
      expect(appError.operation).toBe('clear');
      expect(appError.context).toMatchObject({ table: 'test_streams' });
    }
  });

  it('getStreamHead throws QUERY_FAILED with correct context on failure', async () => {
    vi.spyOn(TestStreamModel.table, 'get').mockRejectedValueOnce(new Error('DB error'));

    try {
      await TestStreamModel.getStreamHead('s1');
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.category).toBe(ErrorCategory.Database);
      expect(appError.code).toBe(DatabaseErrorCode.QUERY_FAILED);
      expect(appError.service).toBe(ErrorService.Local);
      expect(appError.operation).toBe('getStreamHead');
      expect(appError.context).toMatchObject({ table: 'test_streams', id: 's1' });
    }
  });

  it('prependItems throws WRITE_FAILED with correct context on failure', async () => {
    // First call succeeds (get), second fails (where/modify)
    vi.spyOn(TestStreamModel.table, 'get').mockResolvedValueOnce({ id: 's1', stream: ['existing'] });
    const mockWhere = {
      equals: vi.fn().mockReturnValue({
        modify: vi.fn().mockRejectedValueOnce(new Error('DB error')),
      }),
    };
    vi.spyOn(TestStreamModel.table, 'where').mockReturnValue(mockWhere as never);

    try {
      // @ts-expect-error - TypeScript inference issue with generic static methods
      await TestStreamModel.prependItems('s1', ['new']);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.category).toBe(ErrorCategory.Database);
      expect(appError.code).toBe(DatabaseErrorCode.WRITE_FAILED);
      expect(appError.service).toBe(ErrorService.Local);
      expect(appError.operation).toBe('prependItems');
      expect(appError.context).toMatchObject({ table: 'test_streams', id: 's1', itemsCount: 1 });
    }
  });

  it('removeItems throws WRITE_FAILED with correct context on failure', async () => {
    // First call succeeds (get), second fails (where/modify)
    vi.spyOn(TestStreamModel.table, 'get').mockResolvedValueOnce({ id: 's1', stream: ['a', 'b'] });
    const mockWhere = {
      equals: vi.fn().mockReturnValue({
        modify: vi.fn().mockRejectedValueOnce(new Error('DB error')),
      }),
    };
    vi.spyOn(TestStreamModel.table, 'where').mockReturnValue(mockWhere as never);

    try {
      await TestStreamModel.removeItems('s1', ['a']);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.category).toBe(ErrorCategory.Database);
      expect(appError.code).toBe(DatabaseErrorCode.WRITE_FAILED);
      expect(appError.service).toBe(ErrorService.Local);
      expect(appError.operation).toBe('removeItems');
      expect(appError.context).toMatchObject({ table: 'test_streams', id: 's1', itemsCount: 1 });
    }
  });
});
