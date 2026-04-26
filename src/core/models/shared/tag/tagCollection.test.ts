import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie, { Table } from 'dexie';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import * as Core from '@/core';
import { TagCollection } from './tagCollection';
import { AppError } from '@/libs/error/error';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';

type TestTagSchema = Core.TagCollectionModelSchema<string>;

type TestTagTuple = Core.NexusModelTuple<Core.NexusTag[]>;

class TestTagCollection extends TagCollection<string, TestTagSchema> implements TestTagSchema {
  static table: Table<TestTagSchema>;
  id: string;
  tags: Core.TagModel[];

  constructor(data: TestTagSchema) {
    super(data);
    this.id = data.id;
    this.tags = data.tags.map((t) => new Core.TagModel(t));
  }
}

describe('TagCollection', () => {
  let db: Dexie;

  const makeTag = (label: string, taggers: Core.Pubky[] = []): Core.NexusTag => ({
    label,
    taggers,
    taggers_count: taggers.length,
    relationship: false,
  });

  beforeEach(async () => {
    globalThis.indexedDB = indexedDB;
    globalThis.IDBKeyRange = IDBKeyRange;

    db = new Dexie('tag-collection-test');
    db.version(1).stores({ test_tags: 'id' });
    await db.open();

    TestTagCollection.table = db.table<TestTagSchema>('test_tags');
    await TestTagCollection.table.clear();
  });

  it('create upserts a tag collection', async () => {
    const payload: TestTagSchema = {
      id: 'u1',
      tags: [makeTag('a'), makeTag('b', ['x'])],
    };
    await TestTagCollection.create(payload);
    const stored = await TestTagCollection.table.get('u1');
    expect(stored?.id).toBe('u1');
    expect(stored?.tags.length).toBe(2);
  });

  it('findById returns model or null', async () => {
    await TestTagCollection.create({ id: 'u2', tags: [makeTag('x')] });
    const found = await TestTagCollection.findById('u2');
    expect(found).toBeInstanceOf(TestTagCollection);
    expect(found?.id).toBe('u2');

    const notFound = await TestTagCollection.findById('missing');
    expect(notFound).toBeNull();
  });

  it('findByIds returns only existing raw schemas', async () => {
    await TestTagCollection.create({ id: 'a', tags: [makeTag('1')] });
    await TestTagCollection.create({ id: 'b', tags: [makeTag('2')] });
    const results = await TestTagCollection.findByIds(['z', 'a', 'b']);
    const ids = results.map((r) => r.id).sort();
    expect(ids).toEqual(['a', 'b']);
  });

  it('bulkSave upserts multiple collections from tuples', async () => {
    const tuples: TestTagTuple[] = [
      ['x', [makeTag('x1')]],
      ['y', [makeTag('y1'), makeTag('y2')]],
    ];

    await TestTagCollection.bulkSave(tuples);

    const all = await TestTagCollection.table.toArray();
    const byId = new Map(all.map((r) => [r.id, r]));

    expect(byId.get('x')?.tags.map((t) => t.label)).toEqual(['x1']);
    expect(byId.get('y')?.tags.map((t) => t.label)).toEqual(['y1', 'y2']);
  });
});

describe('TagCollection error handling', () => {
  let db: Dexie;

  const makeTag = (label: string, taggers: Core.Pubky[] = []): Core.NexusTag => ({
    label,
    taggers,
    taggers_count: taggers.length,
    relationship: false,
  });

  beforeEach(async () => {
    globalThis.indexedDB = indexedDB;
    globalThis.IDBKeyRange = IDBKeyRange;

    db = new Dexie('tag-collection-error-test');
    db.version(1).stores({ test_tags: 'id' });
    await db.open();

    TestTagCollection.table = db.table<TestTagSchema>('test_tags');
    await TestTagCollection.table.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('bulkSave throws WRITE_FAILED with correct context on failure', async () => {
    vi.spyOn(TestTagCollection.table, 'bulkPut').mockRejectedValueOnce(new Error('DB error'));

    const tuples: TestTagTuple[] = [
      ['x', [makeTag('x1')]],
      ['y', [makeTag('y1')]],
    ];

    try {
      await TestTagCollection.bulkSave(tuples);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.category).toBe(ErrorCategory.Database);
      expect(appError.code).toBe(DatabaseErrorCode.WRITE_FAILED);
      expect(appError.service).toBe(ErrorService.Local);
      expect(appError.operation).toBe('bulkSave');
      expect(appError.context).toMatchObject({ table: 'test_tags', count: 2 });
      expect(appError.cause).toBeInstanceOf(Error);
    }
  });
});
