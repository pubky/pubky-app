import { describe, expect, it } from 'vitest';
import { isHomeserverFileUri } from './homeserverFileUri';

describe('isHomeserverFileUri', () => {
  it('returns true for a well-formed pubky file URI', () => {
    expect(isHomeserverFileUri('pubky://author123/pub/pubky.app/files/file456')).toBe(true);
  });

  it('returns false for http(s) URLs', () => {
    expect(isHomeserverFileUri('https://example.com/cover.png')).toBe(false);
    expect(isHomeserverFileUri('http://example.com/cover.png')).toBe(false);
  });

  it('returns false for nullish / empty / whitespace', () => {
    expect(isHomeserverFileUri(null)).toBe(false);
    expect(isHomeserverFileUri(undefined)).toBe(false);
    expect(isHomeserverFileUri('')).toBe(false);
    expect(isHomeserverFileUri('   ')).toBe(false);
  });

  it('returns false for a malformed pubky file URI', () => {
    expect(isHomeserverFileUri('pubky://author123/pub/pubky.app/files/')).toBe(false);
  });

  it('returns false for non-file pubky URIs', () => {
    expect(isHomeserverFileUri('pubky://author123/pub/pubky.app/posts/post456')).toBe(false);
  });
});
