import { describe, expect, it } from 'vitest';
import { normalizeContentSearchQuery, validateContentSearchQuery } from './contentSearch';

describe('content search query validation', () => {
  it('normalizes surrounding whitespace and accepts Nexus-compatible queries', () => {
    expect(normalizeContentSearchQuery('  bitcoin   wallet  ')).toBe('bitcoin   wallet');
    expect(validateContentSearchQuery('  bitcoin   wallet  ')).toEqual({
      isValid: true,
      query: 'bitcoin   wallet',
    });
  });

  it.each([
    ['b', 'Search must be at least 2 characters'],
    ['1234567890123456789012345678901', 'Search can be max 30 characters'],
    ['one two three four five', 'Search can contain up to 4 terms'],
  ])('rejects %s with the matching Nexus constraint', (query, message) => {
    expect(validateContentSearchQuery(query)).toEqual({ isValid: false, message });
  });
});
