import { describe, expect, it } from 'vitest';
import {
  CONTENT_SEARCH_QUERY_MAX_LENGTH,
  CONTENT_SEARCH_QUERY_MAX_TERMS,
  CONTENT_SEARCH_QUERY_MIN_LENGTH,
} from '@/config/search';
import { validateContentSearchQuery } from './contentSearch';

describe('content search query validation', () => {
  it('normalizes surrounding whitespace and accepts Nexus-compatible queries', () => {
    expect(validateContentSearchQuery('  bitcoin   wallet  ')).toEqual({
      isValid: true,
      query: 'bitcoin   wallet',
    });
  });

  it.each([
    ['b', `Search must be at least ${CONTENT_SEARCH_QUERY_MIN_LENGTH} characters`],
    ['1234567890123456789012345678901', `Search can be max ${CONTENT_SEARCH_QUERY_MAX_LENGTH} characters`],
    ['one two three four five', `Search can contain up to ${CONTENT_SEARCH_QUERY_MAX_TERMS} terms`],
  ])('rejects %s with the matching Nexus constraint', (query, message) => {
    expect(validateContentSearchQuery(query)).toEqual({ isValid: false, message });
  });
});
