import Dexie, { Table } from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Pubky } from '@/models/models.types';
import { TagModel } from '@/models/shared/tag/tag';
import type { TagCollectionModelSchema } from '@/models/shared/tag/tag.schema';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { TagCollection } from './tagCollection';

type TestTagSchema = TagCollectionModelSchema<string>;

class TestTagCollection extends TagCollection<string, TestTagSchema> implements TestTagSchema {
  static table: Table<TestTagSchema>;
  id: string;
  tags: TagModel[];

  constructor(data: TestTagSchema) {
    super(data);
    this.id = data.id;
    this.tags = data.tags.map((t) => new TagModel(t));
  }
}

describe('TagCollection', () => {
  let db: Dexie;

  const makeTag = (label: string, taggers: Pubky[] = []): NexusTag => ({
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
});

describe('TagCollection local intent', () => {
  it('prunes expired local intents while retaining live intents for other viewers', () => {
    const now = Date.now();
    const collection = new TestTagCollection({
      id: 'profile',
      tags: [],
      mutations: {
        expired: { viewerId: 'old', relationship: true, expiresAt: now },
        live: { viewerId: 'other', relationship: false, expiresAt: now + 60_000 },
      },
    });
    collection.recordMutation('NEW', 'viewer', true);
    expect(Object.keys(collection.mutations ?? {})).toEqual(['live', 'viewer:new']);
    expect(collection.mutations?.live).toEqual({ viewerId: 'other', relationship: false, expiresAt: now + 60_000 });
    expect(collection.mutations?.['viewer:new']).toMatchObject({ viewerId: 'viewer', relationship: true });
  });
});

describe('TagCollection mutation ownership', () => {
  it('keeps operations from different viewers on the same label independently', () => {
    const row = new TestTagCollection({ id: 'profile', tags: [] });
    row.recordMutation('Bitcoin', 'alice', true, 'a', false);
    row.recordMutation('bitcoin', 'bob', false, 'b', false);
    expect(row.ownsMutation('BITCOIN', 'alice', 'a')).toBe(true);
    expect(row.ownsMutation('bitcoin', 'bob', 'b')).toBe(true);
    row.recordMutation('bitcoin', 'alice', false, 'newer', false);
    expect(row.ownsMutation('bitcoin', 'alice', 'a')).toBe(false);
    expect(row.ownsMutation('bitcoin', 'bob', 'b')).toBe(true);
  });

  it('can undo an active viewer addition after a guest refresh changes the raw relationship', () => {
    const row = new TestTagCollection({
      id: 'profile',
      tags: [{ label: 'bitcoin', taggers: ['other', 'alice'], taggers_count: 2, relationship: false }],
      cache: { viewerId: null, cursor: 1, exhausted: true, fetchedAt: 1, revision: 2 },
      mutations: {
        bitcoin: { viewerId: 'alice', relationship: true, expiresAt: Date.now() + 1000, id: 'pending', synced: false },
      },
    });
    expect(row.ownsMutation('bitcoin', 'alice', 'pending')).toBe(true);
    expect(row.removeTagger('bitcoin', 'alice')).toBe(false);
    expect(row.tags[0]).toMatchObject({ taggers: ['other'], taggers_count: 1, relationship: false });
  });

  it('retains expired pending operation identity until it settles', () => {
    const row = new TestTagCollection({
      id: 'profile',
      tags: [],
      mutations: {
        bitcoin: { viewerId: 'alice', relationship: true, expiresAt: 0, id: 'pending', synced: false },
      },
    });
    row.recordMutation('other', 'bob', true, 'other');
    expect(row.ownsMutation('bitcoin', 'alice', 'pending')).toBe(true);
  });
});
