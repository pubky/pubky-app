import { describe, expect, it, vi } from 'vitest';
import { parseCollectionContent, resolveCollectionCoverImage } from './collectionContent';

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getFileUrl: vi.fn(({ fileId, variant }: { fileId: string; variant: string }) => `cdn://${fileId}?v=${variant}`),
  },
}));

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

describe('resolveCollectionCoverImage', () => {
  describe('empty / nullish input', () => {
    it('returns null for null', () => {
      expect(resolveCollectionCoverImage(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(resolveCollectionCoverImage(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(resolveCollectionCoverImage('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(resolveCollectionCoverImage('   ')).toBeNull();
    });
  });

  describe('absolute http(s) URLs', () => {
    it('returns valid https URLs as-is', () => {
      expect(resolveCollectionCoverImage('https://example.com/cover.png')).toBe('https://example.com/cover.png');
    });

    it('returns valid http URLs as-is', () => {
      expect(resolveCollectionCoverImage('http://example.com/cover.png')).toBe('http://example.com/cover.png');
    });

    it('trims surrounding whitespace before validating', () => {
      expect(resolveCollectionCoverImage('  https://example.com/cover.png  ')).toBe('https://example.com/cover.png');
    });
  });

  describe('absolute URL validation', () => {
    // The consumer sets the return value on a React inline-style object
    // (`style={{ backgroundImage: url(...) }}`), so we hand it only values the
    // browser can actually load: well-formed http(s) URLs. Unsupported schemes
    // and malformed strings are rejected here so the call site can fall back to
    // a default background.

    it('rejects URLs with non-http(s) schemes (javascript:)', () => {
      expect(resolveCollectionCoverImage('javascript:alert(1)')).toBeNull();
    });

    it('rejects URLs with non-http(s) schemes (data:)', () => {
      expect(resolveCollectionCoverImage('data:image/png;base64,AAAA')).toBeNull();
    });

    it('rejects URLs with non-http(s) schemes (file:)', () => {
      expect(resolveCollectionCoverImage('file:///etc/passwd')).toBeNull();
    });

    it('rejects malformed URL strings outright', () => {
      expect(resolveCollectionCoverImage('not a url')).toBeNull();
    });

    it('normalizes http(s) URLs without percent-encoding parens/semicolons', () => {
      // `new URL()` normalizes (e.g. encodes spaces) but leaves `)` and `;`
      // untouched in the path. That's fine for the only consumer: a React
      // inline-style object assigns through the CSSOM property setter, which
      // parses the string solely as a value for `background-image` — it cannot
      // inject sibling declarations. Worst case a literal `)` makes the value
      // unparseable and the background silently doesn't render (cosmetic).
      const url = 'https://x/a.png); background: red; /*';
      const result = resolveCollectionCoverImage(url);
      expect(result).not.toBeNull();
      // Whitespace is percent-encoded by URL normalization.
      expect(result).not.toContain(' ');
    });
  });

  describe('pubky:// URIs', () => {
    it('resolves a well-formed pubky file URI through FileController', () => {
      const uri = 'pubky://author123/pub/pubky.app/files/file456';
      // Implementation builds composite id `author123:file456` then asks for a CDN URL.
      expect(resolveCollectionCoverImage(uri)).toBe('cdn://author123:file456?v=feed');
    });

    it('returns null for a malformed pubky URI (no file segment)', () => {
      expect(resolveCollectionCoverImage('pubky://author123/pub/pubky.app/files/')).toBeNull();
    });
  });
});
