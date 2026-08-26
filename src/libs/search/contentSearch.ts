import {
  CONTENT_SEARCH_QUERY_MAX_LENGTH,
  CONTENT_SEARCH_QUERY_MAX_TERMS,
  CONTENT_SEARCH_QUERY_MIN_LENGTH,
} from '@/config/search';

type ContentSearchValidationResult = { isValid: true; query: string } | { isValid: false; message: string };

export function validateContentSearchQuery(query: string): ContentSearchValidationResult {
  // Collapse internal whitespace runs: Nexus tokenizes `a  b` and `a b`
  // identically, so they must share one recents chip, one stream id and one
  // request cache key — and padding must not eat into the length budget.
  const normalizedQuery = query.trim().replace(/\s+/g, ' ');
  // Count code points, not UTF-16 units — an emoji is one character to the
  // user, not two.
  const queryLength = [...normalizedQuery].length;

  if (queryLength < CONTENT_SEARCH_QUERY_MIN_LENGTH) {
    return { isValid: false, message: `Search must be at least ${CONTENT_SEARCH_QUERY_MIN_LENGTH} characters` };
  }
  if (queryLength > CONTENT_SEARCH_QUERY_MAX_LENGTH) {
    return { isValid: false, message: `Search can be max ${CONTENT_SEARCH_QUERY_MAX_LENGTH} characters` };
  }
  if (normalizedQuery.split(' ').length > CONTENT_SEARCH_QUERY_MAX_TERMS) {
    return { isValid: false, message: `Search can contain up to ${CONTENT_SEARCH_QUERY_MAX_TERMS} terms` };
  }

  return { isValid: true, query: normalizedQuery };
}
