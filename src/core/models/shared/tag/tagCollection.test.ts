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
        expired: { id: 'expired', label: 'expired', synced: true, viewerId: 'old', relationship: true, expiresAt: now },
        live: {
          id: 'live',
          label: 'live',
          synced: true,
          viewerId: 'other',
          relationship: false,
          expiresAt: now + 60_000,
        },
      },
    });
    collection.recordMutation('NEW', 'viewer', true, 'new-operation', true);
    expect(Object.keys(collection.mutations ?? {})).toEqual(['live', 'viewer:new']);
    expect(collection.mutations?.live).toEqual({
      id: 'live',
      label: 'live',
      synced: true,
      viewerId: 'other',
      relationship: false,
      expiresAt: now + 60_000,
    });
    expect(collection.mutations?.['viewer:new']).toMatchObject({ viewerId: 'viewer', relationship: true });
  });
});

describe('TagCollection tag address', () => {
  it('records the address a create wrote, and none for a delete', () => {
    const row = new TestTagCollection({ id: 'profile', tags: [] });
    row.recordMutation('bitcoin', 'viewer', true, 'a', false, 'pubky://viewer/pub/pubky.app/tags/TAG01');
    expect(row.mutations?.['viewer:bitcoin']?.uri).toBe('pubky://viewer/pub/pubky.app/tags/TAG01');
    row.recordMutation('bitcoin', 'viewer', false, 'b', false);
    expect(row.mutations?.['viewer:bitcoin']).not.toHaveProperty('uri');
  });

  it('keeps the Nexus tag_uri through a local write, and adds none to rows cached without it', () => {
    const tagUri = 'pubky://viewer/pub/mapky/tags/MAPKY01';
    const row = new TestTagCollection({
      id: 'profile',
      tags: [
        { label: 'bitcoin', taggers: ['viewer'], taggers_count: 1, relationship: true, tag_uri: tagUri },
        { label: 'legacy', taggers: [], taggers_count: 1, relationship: false },
      ],
    });
    row.addTagger('pubky', 'viewer');
    expect(row.tags[0].tag_uri).toBe(tagUri);
    expect(row.tags[1]).not.toHaveProperty('tag_uri');
  });
});

describe('TagCollection label fold', () => {
  it('keeps labels that differ outside ASCII apart, as the stored tag files are', () => {
    const row = new TestTagCollection({ id: 'profile', tags: [] });
    row.recordMutation('xÄpfel', 'viewer', true, 'a', false, 'pubky://viewer/pub/social/v1/tags/UPPER.json');
    row.recordMutation('xäpfel', 'viewer', true, 'b', false, 'pubky://viewer/pub/social/v1/tags/LOWER.json');
    expect(Object.keys(row.mutations ?? {}).sort()).toEqual(['viewer:xäpfel', 'viewer:xÄpfel'].sort());
    // Each add creates its own label (false = the label did not exist yet)
    expect(row.addTagger('xÄpfel', 'viewer')).toBe(false);
    expect(row.addTagger('xäpfel', 'viewer')).toBe(false);
    expect(row.tags.map((tag) => tag.label)).toEqual(['xÄpfel', 'xäpfel']);
    expect(row.findByLabel('xÄpfel')?.label).toBe('xÄpfel');
  });

  it('still folds ASCII case into one label', () => {
    const row = new TestTagCollection({ id: 'profile', tags: [] });
    row.recordMutation('Bitcoin', 'viewer', true, 'a', false);
    row.recordMutation('BITCOIN', 'viewer', true, 'b', false);
    expect(Object.keys(row.mutations ?? {})).toEqual(['viewer:bitcoin']);
    expect(row.addTagger('Bitcoin', 'viewer')).toBe(false);
    // The same label: the viewer already tags it
    expect(row.addTagger('BITCOIN', 'viewer')).toBeNull();
    expect(row.findByLabel('BITCOIN')?.label).toBe('Bitcoin');
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
        bitcoin: {
          label: 'bitcoin',
          viewerId: 'alice',
          relationship: true,
          expiresAt: Date.now() + 1000,
          id: 'pending',
          synced: false,
        },
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
        bitcoin: {
          label: 'bitcoin',
          viewerId: 'alice',
          relationship: true,
          expiresAt: 0,
          id: 'pending',
          synced: false,
        },
      },
    });
    row.recordMutation('other', 'bob', true, 'other', true);
    expect(row.ownsMutation('bitcoin', 'alice', 'pending')).toBe(true);
  });
});
