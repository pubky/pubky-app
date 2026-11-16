import { afterEach, describe, expect, it, vi } from 'vitest';
import { sliceGraphemes, splitGraphemes, truncateByGraphemes } from './truncate';

describe('sliceGraphemes', () => {
  it('keeps the first max clusters and reports whether anything was cut', () => {
    expect(sliceGraphemes('a👨‍👩‍👧b', 2)).toEqual({ text: 'a👨‍👩‍👧', count: 2, truncated: true });
    expect(sliceGraphemes('a👨‍👩‍👧b', 3)).toEqual({ text: 'a👨‍👩‍👧b', count: 3, truncated: false });
    expect(sliceGraphemes('abc', 0)).toEqual({ text: '', count: 0, truncated: true });
    expect(sliceGraphemes('', 0)).toEqual({ text: '', count: 0, truncated: false });
  });
});

describe('splitGraphemes', () => {
  it('splits into grapheme clusters, keeping emoji and ZWJ sequences whole', () => {
    expect(splitGraphemes('a👍👨‍👩‍👧b')).toEqual(['a', '👍', '👨‍👩‍👧', 'b']);
    expect(splitGraphemes('')).toEqual([]);
  });
});

describe('truncateByGraphemes', () => {
  it('returns the text unchanged when shorter than the limit', () => {
    expect(truncateByGraphemes('hello', 10)).toBe('hello');
  });

  it('returns the text unchanged when exactly at the limit (no ellipsis)', () => {
    expect(truncateByGraphemes('hello', 5)).toBe('hello');
  });

  it('truncates and appends an ellipsis when over the limit', () => {
    expect(truncateByGraphemes('hello world', 5)).toBe('hello...');
  });

  it('returns an empty string unchanged', () => {
    expect(truncateByGraphemes('', 5)).toBe('');
  });

  it('counts emoji as single grapheme clusters', () => {
    expect(truncateByGraphemes('👍👍👍', 2)).toBe('👍👍...');
  });

  it('does not split a multi-codepoint (ZWJ) grapheme cluster', () => {
    // The family emoji is a single grapheme cluster; truncating after 'a' must
    // keep it whole rather than slicing mid-cluster.
    expect(truncateByGraphemes('a👨‍👩‍👧', 1)).toBe('a...');
  });
});

describe('without Intl.Segmenter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('loads and truncates text when the browser has no Segmenter constructor', async () => {
    vi.stubGlobal('Intl', Object.create(Intl, { Segmenter: { value: undefined } }));
    vi.resetModules();
    const { splitGraphemes, sliceGraphemes, truncateByGraphemes } = await import('./truncate');

    expect(splitGraphemes('hello')).toEqual(['h', 'e', 'l', 'l', 'o']);
    expect(truncateByGraphemes('hello world', 5)).toBe('hello...');
    expect(truncateByGraphemes('hello', 5)).toBe('hello');
    expect(sliceGraphemes('hello', 0)).toEqual({ text: '', count: 0, truncated: true });
    expect(sliceGraphemes('', 0)).toEqual({ text: '', count: 0, truncated: false });
  });

  it.each(['👍', '👍🏽', '👨‍👩‍👧', '🇷🇸', 'e\u0301', '✌️', '1️⃣'])(
    'keeps the Unicode symbol %s whole at the truncation boundary',
    async (symbol) => {
      vi.stubGlobal('Intl', Object.create(Intl, { Segmenter: { value: undefined } }));
      vi.resetModules();
      const { splitGraphemes, sliceGraphemes, truncateByGraphemes } = await import('./truncate');

      expect(splitGraphemes(`a${symbol}b`)).toEqual(['a', symbol, 'b']);
      expect(sliceGraphemes(`a${symbol}b`, 2)).toEqual({ text: `a${symbol}`, count: 2, truncated: true });
      expect(truncateByGraphemes(`a${symbol}b`, 2)).toBe(`a${symbol}...`);
      expect(truncateByGraphemes(`a${symbol}`, 2)).toBe(`a${symbol}`);
    },
  );
});
