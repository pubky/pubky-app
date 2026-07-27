import { describe, expect, it, vi } from 'vitest';
import { resolveCollectionCoverImage } from './collectionCoverImage';

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getFileUrl: vi.fn(({ fileId, variant }: { fileId: string; variant: string }) => `cdn://${fileId}?v=${variant}`),
  },
}));

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
