import {
  CONTENT_SEARCH_QUERY_MAX_LENGTH,
  CONTENT_SEARCH_QUERY_MAX_TERMS,
  CONTENT_SEARCH_QUERY_MIN_LENGTH,
} from '@/config/search';

type ContentSearchValidationResult = { isValid: true; query: string } | { isValid: false; message: string };

/**
 * Case-insensitive identity of a validated query, like Nexus `by_content`: the
 * stream id and the recents dedupe both key on it, while display keeps the
 * user's casing. Locale-independent so every viewer derives the same key.
 */
export function toContentSearchKey(query: string): string {
  return query.toLowerCase();
}

export function validateContentSearchQuery(query: string): ContentSearchValidationResult {
  // Collapse internal whitespace runs: Nexus tokenizes `a  b` and `a b`
  // identically, so they must share one recents chip, one stream id and one
  // request cache key — and padding must not eat into the length budget.
  const normalizedQuery = query.trim().replace(/\s+/g, ' ');
  // Both bounds must hold for what the user typed and for the key Nexus
  // receives as `q`. Lowercasing never shortens text but can lengthen it
  // (`İ` → `i̇`), so the minimum is checked on the input and the maximum on
  // the key. Count code points, not UTF-16 units — an emoji is one character
  // to the user, not two.
  const inputLength = [...normalizedQuery].length;
  const keyLength = [...toContentSearchKey(normalizedQuery)].length;

  if (inputLength < CONTENT_SEARCH_QUERY_MIN_LENGTH) {
    return { isValid: false, message: `Search must be at least ${CONTENT_SEARCH_QUERY_MIN_LENGTH} characters` };
  }
  if (keyLength > CONTENT_SEARCH_QUERY_MAX_LENGTH) {
    return { isValid: false, message: `Search can be max ${CONTENT_SEARCH_QUERY_MAX_LENGTH} characters` };
  }
  if (normalizedQuery.split(' ').length > CONTENT_SEARCH_QUERY_MAX_TERMS) {
    return { isValid: false, message: `Search can contain up to ${CONTENT_SEARCH_QUERY_MAX_TERMS} terms` };
  }

  return { isValid: true, query: normalizedQuery };
}
