import {
  CONTENT_SEARCH_QUERY_MAX_LENGTH,
  CONTENT_SEARCH_QUERY_MAX_TERMS,
  CONTENT_SEARCH_QUERY_MIN_LENGTH,
} from '@/config/search';

type ContentSearchValidationResult = { isValid: true; query: string } | { isValid: false; message: string };

export function validateContentSearchQuery(query: string): ContentSearchValidationResult {
  const normalizedQuery = query.trim();

  if (normalizedQuery.length < CONTENT_SEARCH_QUERY_MIN_LENGTH) {
    return { isValid: false, message: `Search must be at least ${CONTENT_SEARCH_QUERY_MIN_LENGTH} characters` };
  }
  if (normalizedQuery.length > CONTENT_SEARCH_QUERY_MAX_LENGTH) {
    return { isValid: false, message: `Search can be max ${CONTENT_SEARCH_QUERY_MAX_LENGTH} characters` };
  }
  if (normalizedQuery.split(/\s+/).length > CONTENT_SEARCH_QUERY_MAX_TERMS) {
    return { isValid: false, message: `Search can contain up to ${CONTENT_SEARCH_QUERY_MAX_TERMS} terms` };
  }

  return { isValid: true, query: normalizedQuery };
}
