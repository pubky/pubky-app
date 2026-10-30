import { type CollectionContent as StoredCollectionContent, decodeContent, encodeContent } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it, vi } from 'vitest';
import { COLLECTION_LAYOUT } from '@/config/collections';
import {
  COLLECTION_CONTENT_MAX_LENGTH,
  COLLECTION_ITEM_URI_MAX_LENGTH,
  COLLECTION_ITEMS_MAX_COUNT,
} from '@/config/posts';
import { CollectionPostContent } from './post.collection';

const ITEM_AUTHOR = fakeOwner(3);
const VALID_ITEM_URI = `pubky://${ITEM_AUTHOR}/pub/social/v1/posts/0034A0X7NJ52A`;
/** The same post as an account that has not migrated references it. */
const LEGACY_ITEM_URI = `pubky://${ITEM_AUTHOR}/pub/pubky.app/posts/0034A0X7NJ52A`;

/** The stored envelope of a collection with `items`, as `encodeContent` spells it. */
const stored = (items: StoredCollectionContent['items'], overrides: Partial<StoredCollectionContent> = {}) =>
  encodeContent({ name: 'Stored', description: null, cover_image: null, layout: null, items, ...overrides });

describe('CollectionPostContent', () => {
  describe('normalize', () => {
    it('trims name and description', () => {
      expect(CollectionPostContent.normalize({ name: '  AI papers  ', description: '  Best stuff  ' })).toEqual({
        name: 'AI papers',
        description: 'Best stuff',
        items: [],
        cover_image: undefined,
        layout: COLLECTION_LAYOUT.CARDS,
      });
    });

    it('accepts and validates an optional cover image URL', () => {
      expect(
        CollectionPostContent.normalize({
          name: 'Cover',
          coverImage: '  https://cdn.example.com/cover.png  ',
        }),
      ).toMatchObject({
        cover_image: 'https://cdn.example.com/cover.png',
      });
    });

    it('rejects cover images with unsupported protocols', () => {
      expect(() =>
        CollectionPostContent.normalize({
          name: 'Cover',
          coverImage: 'ftp://example.com/cover.png',
        }),
      ).toThrow('Collection cover image URL is invalid');
    });

    it('allows pubky, http, and https item URIs', () => {
      expect(
        CollectionPostContent.normalize({
          name: 'Links',
          items: [VALID_ITEM_URI, 'https://example.com/post', 'http://example.com/post'],
        }).items,
      ).toHaveLength(3);
    });

    it('rejects whitespace-only names', () => {
      expect(() => CollectionPostContent.normalize({ name: '   ' })).toThrow('Collection name is required');
    });

    it('rejects too many items', () => {
      expect(() =>
        CollectionPostContent.normalize({
          name: 'Too much',
          items: Array.from(
            { length: COLLECTION_ITEMS_MAX_COUNT + 1 },
            (_, index) => `https://example.com/post/${index}`,
          ),
        }),
      ).toThrow('Collection has too many items');
    });

    it('rejects item URIs over the spec limit', () => {
      const uriPrefix = 'https://example.com/';
      const overLimitUri = `${uriPrefix}${'a'.repeat(COLLECTION_ITEM_URI_MAX_LENGTH - uriPrefix.length + 1)}`;

      expect(() =>
        CollectionPostContent.normalize({
          name: 'Too long',
          items: [overLimitUri],
        }),
      ).toThrow('Collection item URI is too long');
    });

    it('rejects unsupported URI protocols', () => {
      expect(() =>
        CollectionPostContent.normalize({
          name: 'Bad URI',
          items: ['ftp://example.com/post'],
        }),
      ).toThrow('Collection item URI is invalid');
    });

    it('trims and deduplicates item URIs', () => {
      expect(
        CollectionPostContent.normalize({
          name: 'Links',
          items: [`  ${VALID_ITEM_URI}  `, VALID_ITEM_URI, '  https://example.com/post  '],
        }),
      ).toEqual({
        name: 'Links',
        description: '',
        items: [VALID_ITEM_URI, 'https://example.com/post'],
        cover_image: undefined,
        layout: COLLECTION_LAYOUT.CARDS,
      });
    });

    it('rejects whitespace-only item URIs', () => {
      expect(() =>
        CollectionPostContent.normalize({
          name: 'Links',
          items: ['   '],
        }),
      ).toThrow('Collection item URI is required');
    });

    it('rejects serialized content over the spec limit', () => {
      const stringifySpy = vi
        .spyOn(JSON, 'stringify')
        .mockReturnValueOnce('x'.repeat(COLLECTION_CONTENT_MAX_LENGTH + 1));

      expect(() =>
        CollectionPostContent.normalize({
          name: 'Too big',
          items: [VALID_ITEM_URI],
        }),
      ).toThrow('Collection content is too long');

      stringifySpy.mockRestore();
    });
  });

  describe('parse', () => {
    it('parses a v1 envelope, its items by uri with the notes dropped', () => {
      const json = stored([{ uri: VALID_ITEM_URI, note: 'start here' }], {
        name: 'Proof of Work',
        description: 'Bitcoin writing',
      });

      expect(CollectionPostContent.parse(json)).toEqual({
        name: 'Proof of Work',
        description: 'Bitcoin writing',
        items: [VALID_ITEM_URI],
        cover_image: undefined,
        layout: COLLECTION_LAYOUT.CARDS,
      });
    });

    it('parses a 0.x envelope, whose items are plain URIs', () => {
      const json = JSON.stringify({
        name: 'Legacy',
        description: '',
        items: [LEGACY_ITEM_URI],
        cover_image: 'https://cdn.example.com/cover.png',
      });

      expect(CollectionPostContent.parse(json)).toEqual({
        name: 'Legacy',
        description: '',
        items: [LEGACY_ITEM_URI],
        cover_image: 'https://cdn.example.com/cover.png',
        layout: COLLECTION_LAYOUT.CARDS,
      });
    });

    it('parses minimal envelopes with only a name (per spec, other fields are optional)', () => {
      expect(CollectionPostContent.parse(JSON.stringify({ name: 'Minimal' }))).toEqual({
        name: 'Minimal',
        description: '',
        items: [],
        cover_image: undefined,
        layout: COLLECTION_LAYOUT.CARDS,
      });
    });

    it('parses envelopes with null description and cover_image, as the data model spells none', () => {
      expect(CollectionPostContent.parse(stored([{ uri: VALID_ITEM_URI, note: null }]))).toEqual({
        name: 'Stored',
        description: '',
        items: [VALID_ITEM_URI],
        cover_image: undefined,
        layout: COLLECTION_LAYOUT.CARDS,
      });
    });

    it('reads List and Visual and falls back to Grid for missing or unknown layouts', () => {
      expect(CollectionPostContent.parse(stored([], { layout: 'list' }))?.layout).toBe(COLLECTION_LAYOUT.LIST);
      expect(CollectionPostContent.parse(stored([], { layout: 'visual' }))?.layout).toBe(COLLECTION_LAYOUT.VISUAL);
      expect(CollectionPostContent.parse(JSON.stringify({ name: 'Legacy' }))?.layout).toBe(COLLECTION_LAYOUT.CARDS);
      expect(CollectionPostContent.parse(JSON.stringify({ name: 'Future', layout: 'spiral' }))?.layout).toBe(
        COLLECTION_LAYOUT.CARDS,
      );
    });

    it('returns null for malformed envelopes', () => {
      expect(CollectionPostContent.parse('not json')).toBeNull();
      expect(CollectionPostContent.parse(JSON.stringify({ description: 'no name' }))).toBeNull();
      expect(CollectionPostContent.parse(JSON.stringify({ name: 'Bad items', items: 'not-an-array' }))).toBeNull();
      expect(CollectionPostContent.parse(JSON.stringify({ name: 'Bad cover', cover_image: 42 }))).toBeNull();
    });

    it('returns null when the envelope shape is valid but content fails validation', () => {
      expect(
        CollectionPostContent.parse(JSON.stringify({ name: 'Bad URI', items: ['ftp://example.com/post'] })),
      ).toBeNull();
    });
  });

  describe('toNewInput', () => {
    it('spells the buildPost input of a new collection, items without notes', () => {
      const normalized = CollectionPostContent.normalize({
        name: 'Reading',
        description: '',
        items: [VALID_ITEM_URI],
        layout: COLLECTION_LAYOUT.LIST,
      });

      expect(CollectionPostContent.toNewInput(normalized)).toEqual({
        kind: 'collection',
        name: 'Reading',
        description: null,
        items: [{ uri: VALID_ITEM_URI }],
        cover_image: null,
        layout: 'list',
      });
    });
  });

  describe('toStored', () => {
    it('merges the shown envelope onto the stored one, keeping item notes and unknown members', () => {
      const storedEnvelope = decodeContent({
        kind: 'collection',
        content: stored([{ uri: VALID_ITEM_URI, note: 'start here' }], { description: 'Old' }),
      });
      if (storedEnvelope?.kind !== 'collection') throw new Error('not a collection');
      const withUnknown = { ...storedEnvelope.content, $unknown: '{"mood":"calm"}' };

      const next = CollectionPostContent.toStored(withUnknown, {
        name: 'Renamed',
        description: 'New',
        items: ['https://example.com/post', VALID_ITEM_URI],
        layout: COLLECTION_LAYOUT.VISUAL,
      });

      expect(next).toEqual({
        name: 'Renamed',
        description: 'New',
        cover_image: null,
        layout: 'visual',
        items: [
          { uri: 'https://example.com/post', note: null },
          { uri: VALID_ITEM_URI, note: 'start here' },
        ],
        $unknown: '{"mood":"calm"}',
      });
      // What `encodeContent` spells of it decodes back, notes included
      expect(decodeContent({ kind: 'collection', content: encodeContent(next) })).toEqual({
        kind: 'collection',
        content: next,
      });
    });

    it('spells an empty description as null and a cover as given', () => {
      const base: StoredCollectionContent = {
        name: 'B',
        description: null,
        items: [],
        cover_image: null,
        layout: null,
      };

      expect(
        CollectionPostContent.toStored(base, {
          name: 'B',
          description: '',
          items: [],
          cover_image: 'https://cdn.example.com/cover.png',
          layout: COLLECTION_LAYOUT.CARDS,
        }),
      ).toEqual({
        name: 'B',
        description: null,
        items: [],
        cover_image: 'https://cdn.example.com/cover.png',
        layout: 'grid',
      });
    });
  });

  describe('item helpers', () => {
    const spellings = [VALID_ITEM_URI, LEGACY_ITEM_URI];

    it('adds an item idempotently, whichever way the collection spells it', () => {
      const v1 = CollectionPostContent.normalize({ name: 'Saved', items: [VALID_ITEM_URI] });
      const legacy = CollectionPostContent.normalize({ name: 'Saved', items: [LEGACY_ITEM_URI] });

      expect(CollectionPostContent.addItem(v1, spellings)).toBe(v1);
      expect(CollectionPostContent.addItem(legacy, spellings)).toBe(legacy);
    });

    it('prepends a new item under its first spelling, the v1 reference', () => {
      const existingUri = 'https://example.com/post';
      const collection = CollectionPostContent.normalize({ name: 'Saved', items: [existingUri] });

      expect(CollectionPostContent.addItem(collection, spellings).items).toEqual([VALID_ITEM_URI, existingUri]);
    });

    it('removes an item whichever way the collection spells it', () => {
      const v1 = CollectionPostContent.normalize({
        name: 'Saved',
        items: [VALID_ITEM_URI, 'https://example.com/post'],
      });
      const legacy = CollectionPostContent.normalize({
        name: 'Saved',
        items: [LEGACY_ITEM_URI, 'https://example.com/post'],
      });

      expect(CollectionPostContent.removeItem(v1, spellings).items).toEqual(['https://example.com/post']);
      expect(CollectionPostContent.removeItem(legacy, spellings).items).toEqual(['https://example.com/post']);
    });

    it('returns the same collection when removing an absent item', () => {
      const collection = CollectionPostContent.normalize({ name: 'Saved', items: [VALID_ITEM_URI] });

      expect(CollectionPostContent.removeItem(collection, ['https://example.com/missing'])).toBe(collection);
    });
  });

  describe('reorderItems', () => {
    const uriA = 'https://example.com/post/a';
    const uriB = 'https://example.com/post/b';
    const uriC = 'https://example.com/post/c';

    it('reorders items to the drafted order', () => {
      const collection = CollectionPostContent.normalize({ name: 'Saved', items: [uriA, uriB, uriC] });

      expect(CollectionPostContent.reorderItems(collection, [uriC, uriA, uriB]).items).toEqual([uriC, uriA, uriB]);
    });

    it('returns the same collection when the drafted order matches the current order', () => {
      const collection = CollectionPostContent.normalize({ name: 'Saved', items: [uriA, uriB] });

      expect(CollectionPostContent.reorderItems(collection, [uriA, uriB])).toBe(collection);
    });

    it('keeps items added since the draft was taken, leading the reordered set', () => {
      // uriC was added (prepended) after the [uriB, uriA] draft was snapshotted.
      const collection = CollectionPostContent.normalize({ name: 'Saved', items: [uriC, uriA, uriB] });

      expect(CollectionPostContent.reorderItems(collection, [uriB, uriA]).items).toEqual([uriC, uriB, uriA]);
    });

    it('drops drafted items that were removed since the draft was taken', () => {
      // uriB was removed after the [uriC, uriB, uriA] draft was snapshotted.
      const collection = CollectionPostContent.normalize({ name: 'Saved', items: [uriA, uriC] });

      expect(CollectionPostContent.reorderItems(collection, [uriC, uriB, uriA]).items).toEqual([uriC, uriA]);
    });

    it('trims drafted URIs before matching', () => {
      const collection = CollectionPostContent.normalize({ name: 'Saved', items: [uriA, uriB] });

      expect(CollectionPostContent.reorderItems(collection, [`  ${uriB}  `, uriA]).items).toEqual([uriB, uriA]);
    });
  });
});
