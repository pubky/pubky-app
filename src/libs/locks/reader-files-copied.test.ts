import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCKS_READER_FILES_COPY_VERSION } from '@/config/locks';
import {
  hasCopiedLocksReaderFiles,
  locksReaderFilesCopiedKey,
  markLocksReaderFilesCopied,
} from './reader-files-copied';

describe('the Locks reader files copy record', () => {
  const PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
  const OTHER_PUBKY = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y';
  const KEY = locksReaderFilesCopiedKey(PUBKY);

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('is recorded per account', () => {
    markLocksReaderFilesCopied(PUBKY);

    expect(hasCopiedLocksReaderFiles(PUBKY)).toBe(true);
    expect(hasCopiedLocksReaderFiles(OTHER_PUBKY)).toBe(false);
  });

  it('trusts a newer version, and never lowers it', () => {
    const newer = JSON.stringify({ v: LOCKS_READER_FILES_COPY_VERSION + 1 });
    localStorage.setItem(KEY, newer);

    expect(hasCopiedLocksReaderFiles(PUBKY)).toBe(true);
    markLocksReaderFilesCopied(PUBKY);
    expect(localStorage.getItem(KEY)).toBe(newer);
  });

  it.each([
    ['an older version', JSON.stringify({ v: LOCKS_READER_FILES_COPY_VERSION - 1 })],
    ['a corrupt entry', '{not json'],
    ['an entry of another shape', JSON.stringify({ copied: true })],
  ])('is not trusted with %s, and is written over', (_label, raw) => {
    localStorage.setItem(KEY, raw);

    expect(hasCopiedLocksReaderFiles(PUBKY)).toBe(false);
    markLocksReaderFilesCopied(PUBKY);
    expect(hasCopiedLocksReaderFiles(PUBKY)).toBe(true);
  });

  // A throw from the check would fail the read that calls it; one from the write would go unhandled.
  it('never throws when the storage refuses access', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(hasCopiedLocksReaderFiles(PUBKY)).toBe(false);
    expect(() => markLocksReaderFilesCopied(PUBKY)).not.toThrow();
  });
});
