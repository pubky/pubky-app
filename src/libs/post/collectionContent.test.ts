import { describe, expect, it } from 'vitest';
import { parseCollectionContent } from './collectionContent';

describe('parseCollectionContent', () => {
  describe('invalid input', () => {
    it('returns null for null', () => {
      expect(parseCollectionContent(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(parseCollectionContent(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseCollectionContent('')).toBeNull();
    });

    it('returns null for non-JSON content', () => {
      expect(parseCollectionContent('not json {')).toBeNull();
    });

    it('returns null for a JSON primitive (string)', () => {
      expect(parseCollectionContent('"hello"')).toBeNull();
    });

    it('returns null for a JSON primitive (number)', () => {
      expect(parseCollectionContent('42')).toBeNull();
    });

    it('returns null when `name` is missing', () => {
      expect(parseCollectionContent(JSON.stringify({ items: [] }))).toBeNull();
    });

    it('returns null when `name` is not a string', () => {
      expect(parseCollectionContent(JSON.stringify({ name: 123 }))).toBeNull();
    });
  });

  describe('valid input', () => {
    it('parses the minimal valid envelope (just `name`)', () => {
      const raw = JSON.stringify({ name: 'Empty collection' });

      expect(parseCollectionContent(raw)).toEqual({
        name: 'Empty collection',
        description: undefined,
        items: undefined,
        cover_image: undefined,
      });
    });

    it('parses an empty-items envelope', () => {
      const raw = JSON.stringify({ name: 'Empty', items: [] });

      expect(parseCollectionContent(raw)).toEqual({
        name: 'Empty',
        description: undefined,
        items: [],
        cover_image: undefined,
      });
    });

    it('parses a fully populated envelope', () => {
      const raw = JSON.stringify({
        name: 'Based Bitcoin',
        description: 'A bit of Bitcoin purity amidst all of the madness.',
        items: ['pubky://author/pub/pubky.app/posts/abc', 'pubky://author/pub/pubky.app/posts/def'],
        cover_image: 'https://example.com/cover.png',
      });

      expect(parseCollectionContent(raw)).toEqual({
        name: 'Based Bitcoin',
        description: 'A bit of Bitcoin purity amidst all of the madness.',
        items: ['pubky://author/pub/pubky.app/posts/abc', 'pubky://author/pub/pubky.app/posts/def'],
        cover_image: 'https://example.com/cover.png',
      });
    });

    it('normalizes missing optional fields to undefined', () => {
      const raw = JSON.stringify({ name: 'Partial', items: ['a'] });

      const result = parseCollectionContent(raw);
      expect(result?.description).toBeUndefined();
      expect(result?.cover_image).toBeUndefined();
    });

    it('normalizes explicit null on optional fields to undefined (tolerates null inputs)', () => {
      const raw = JSON.stringify({ name: 'Nullable', items: [], description: null, cover_image: null });

      const result = parseCollectionContent(raw);
      expect(result?.description).toBeUndefined();
      expect(result?.cover_image).toBeUndefined();
    });

    it('normalizes non-array `items` (incl. null) to undefined', () => {
      const raw = JSON.stringify({ name: 'Bad items', items: null });

      const result = parseCollectionContent(raw);
      expect(result?.items).toBeUndefined();
    });

    it('ignores unknown extra fields', () => {
      const raw = JSON.stringify({ name: 'Extras', items: [], extra: 'ignored', nested: { thing: 1 } });

      expect(parseCollectionContent(raw)).toEqual({
        name: 'Extras',
        description: undefined,
        items: [],
        cover_image: undefined,
      });
    });
  });
});
