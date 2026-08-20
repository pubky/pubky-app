import {
  CONTENT_SEARCH_QUERY_MAX_LENGTH,
  CONTENT_SEARCH_QUERY_MAX_TERMS,
  CONTENT_SEARCH_QUERY_MIN_LENGTH,
} from '@/config/search';

type ContentSearchValidationResult = { isValid: true; query: string } | { isValid: false; message: string };

export function normalizeContentSearchQuery(query: string): string {
  return query.trim();
}

export function validateContentSearchQuery(query: string): ContentSearchValidationResult {
  const normalizedQuery = normalizeContentSearchQuery(query);

  if (normalizedQuery.length < CONTENT_SEARCH_QUERY_MIN_LENGTH) {
    return { isValid: false, message: 'Search must be at least 2 characters' };
  }
  if (normalizedQuery.length > CONTENT_SEARCH_QUERY_MAX_LENGTH) {
    return { isValid: false, message: 'Search can be max 30 characters' };
  }
  if (normalizedQuery.split(/\s+/).length > CONTENT_SEARCH_QUERY_MAX_TERMS) {
    return { isValid: false, message: 'Search can contain up to 4 terms' };
  }

  return { isValid: true, query: normalizedQuery };
}
