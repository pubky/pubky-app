import { describe, expect, it, vi } from 'vitest';
import { COLLECTION_LAYOUT } from '@/config/collections';
import {
  COLLECTION_CONTENT_MAX_LENGTH,
  COLLECTION_ITEM_URI_MAX_LENGTH,
  COLLECTION_ITEMS_MAX_COUNT,
} from '@/config/posts';
import { CollectionPostContent } from './post.collection';

const VALID_ITEM_URI = 'pubky://1111111111111111111111111111111111111111111111111111/pub/pubky.app/posts/0034A0X7NJ52A';

describe('CollectionPostContent', () => {
  describe('normalize', () => {
    it('trims name and description', () => {
      expect(CollectionPostContent.normalize({ name: '  AI papers  ', description: '  Best stuff  ' })).toEqual({
        name: 'AI papers',
        description: 'Best stuff',
        items: [],
        cover_image: undefined,
        layout: COLLECTION_LAYOUT.GRID,
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
        layout: COLLECTION_LAYOUT.GRID,
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

  describe('toJson and parse', () => {
    it('serializes and parses a valid envelope', () => {
      const json = CollectionPostContent.toJson({
        name: 'Proof of Work',
        description: 'Bitcoin writing',
        items: [VALID_ITEM_URI],
      });

      expect(CollectionPostContent.parse(json)).toEqual({
        name: 'Proof of Work',
        description: 'Bitcoin writing',
        items: [VALID_ITEM_URI],
        cover_image: undefined,
        layout: COLLECTION_LAYOUT.GRID,
      });
    });

    it('round-trips a cover_image envelope from pubky-app-specs', () => {
      // Mirrors the read shape from `pubky-app-specs` (`PubkyAppCollectionContent`),
      // including `cover_image`. New fields are additive in the envelope; older
      // payloads without `cover_image` are still accepted.
      const json = CollectionPostContent.toJson({
        name: 'Cover',
        description: '',
        items: [],
        coverImage: 'https://cdn.example.com/cover.png',
      });

      expect(CollectionPostContent.parse(json)).toEqual({
        name: 'Cover',
        description: '',
        items: [],
        cover_image: 'https://cdn.example.com/cover.png',
        layout: COLLECTION_LAYOUT.GRID,
      });
    });

    it('parses minimal envelopes with only a name (per spec, other fields are optional)', () => {
      // `description`/`items`/`cover_image` are all optional in the spec
      // envelope, so a payload with just `name` is a valid (older) collection.
      expect(CollectionPostContent.parse(JSON.stringify({ name: 'Minimal' }))).toEqual({
        name: 'Minimal',
        description: '',
        items: [],
        cover_image: undefined,
        layout: COLLECTION_LAYOUT.GRID,
      });
    });

    it('parses pubky-app-specs envelopes with null cover_image', () => {
      expect(
        CollectionPostContent.parse(
          JSON.stringify({
            name: 'Saved posts',
            description: '',
            items: [VALID_ITEM_URI],
            cover_image: null,
          }),
        ),
      ).toEqual({
        name: 'Saved posts',
        description: '',
        items: [VALID_ITEM_URI],
        cover_image: undefined,
        layout: COLLECTION_LAYOUT.GRID,
      });
    });

    it('round-trips List and falls back to Grid for missing or unknown layouts', () => {
      const listJson = CollectionPostContent.toJson({
        name: 'Reading',
        layout: COLLECTION_LAYOUT.LIST,
      });

      expect(CollectionPostContent.parse(listJson)?.layout).toBe(COLLECTION_LAYOUT.LIST);
      expect(CollectionPostContent.parse(JSON.stringify({ name: 'Legacy' }))?.layout).toBe(COLLECTION_LAYOUT.GRID);
      expect(CollectionPostContent.parse(JSON.stringify({ name: 'Future', layout: 'spiral' }))?.layout).toBe(
        COLLECTION_LAYOUT.GRID,
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

  describe('item helpers', () => {
    it('adds an item idempotently', () => {
      const collection = CollectionPostContent.normalize({ name: 'Saved', items: [VALID_ITEM_URI] });

      expect(CollectionPostContent.addItem(collection, VALID_ITEM_URI).items).toEqual([VALID_ITEM_URI]);
    });

    it('prepends a new item', () => {
      const existingUri = 'https://example.com/post';
      const collection = CollectionPostContent.normalize({ name: 'Saved', items: [existingUri] });

      expect(CollectionPostContent.addItem(collection, VALID_ITEM_URI).items).toEqual([VALID_ITEM_URI, existingUri]);
    });

    it('removes an item', () => {
      const collection = CollectionPostContent.normalize({
        name: 'Saved',
        items: [VALID_ITEM_URI, 'https://example.com/post'],
      });

      expect(CollectionPostContent.removeItem(collection, VALID_ITEM_URI).items).toEqual(['https://example.com/post']);
    });

    it('returns the same collection when removing an absent item', () => {
      const collection = CollectionPostContent.normalize({ name: 'Saved', items: [VALID_ITEM_URI] });

      expect(CollectionPostContent.removeItem(collection, 'https://example.com/missing')).toBe(collection);
    });
  });
});
