import { describe, expect, it } from 'vitest';
import {
  CONTENT_SEARCH_QUERY_MAX_LENGTH,
  CONTENT_SEARCH_QUERY_MAX_TERMS,
  CONTENT_SEARCH_QUERY_MIN_LENGTH,
} from '@/config/search';
import { validateContentSearchQuery } from './contentSearch';

describe('content search query validation', () => {
  it('collapses whitespace so equivalent queries share one canonical form', () => {
    // Nexus tokenizes `bitcoin   wallet` and `bitcoin wallet` identically, so
    // both must produce the same recents chip, stream id and cache key.
    expect(validateContentSearchQuery('  bitcoin   wallet  ')).toEqual({
      isValid: true,
      query: 'bitcoin wallet',
    });
  });

  it('does not count whitespace padding toward the length budget', () => {
    const padded = `a${' '.repeat(40)}b`;
    expect(validateContentSearchQuery(padded)).toEqual({ isValid: true, query: 'a b' });
  });

  // Exactly-at-the-boundary queries must stay accepted: an off-by-one in any
  // comparison (`<` vs `<=`) flips one of these.
  it.each([
    ['minimum length', 'ab'],
    ['maximum length', 'a'.repeat(CONTENT_SEARCH_QUERY_MAX_LENGTH)],
    ['maximum terms', 'one two three four'],
  ])('accepts a query at the %s boundary', (_label, query) => {
    expect(validateContentSearchQuery(query)).toEqual({ isValid: true, query });
  });

  it.each([
    ['b', `Search must be at least ${CONTENT_SEARCH_QUERY_MIN_LENGTH} characters`],
    ['1234567890123456789012345678901', `Search can be max ${CONTENT_SEARCH_QUERY_MAX_LENGTH} characters`],
    ['one two three four five', `Search can contain up to ${CONTENT_SEARCH_QUERY_MAX_TERMS} terms`],
  ])('rejects %s with the matching Nexus constraint', (query, message) => {
    expect(validateContentSearchQuery(query)).toEqual({ isValid: false, message });
  });

  it('counts characters as code points, not UTF-16 units', () => {
    // One emoji is one character to the user (`'😀'.length === 2` must not
    // sneak past the minimum)…
    expect(validateContentSearchQuery('😀')).toEqual({
      isValid: false,
      message: `Search must be at least ${CONTENT_SEARCH_QUERY_MIN_LENGTH} characters`,
    });
    // …and sixteen emojis (32 UTF-16 units) are sixteen characters, well
    // under the 30-character maximum.
    const emojiQuery = '🚀'.repeat(16);
    expect(validateContentSearchQuery(emojiQuery)).toEqual({ isValid: true, query: emojiQuery });
  });
});
