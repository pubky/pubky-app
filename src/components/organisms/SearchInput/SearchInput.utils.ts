import { MAX_ACTIVE_SEARCH_TAGS } from '@/stores/search/search.constants';
/**
 * Parse tags from URL search params
 * @param tagsParam - Raw tags parameter from URL (comma-separated)
 * @returns Array of normalized tag strings
 */
export function parseTagsFromUrl(tagsParam: string | null): string[] {
  if (!tagsParam || tagsParam.trim() === '') {
    return [];
  }
  return (
    tagsParam
      .split(',')
      // Note: `useSearchParams().get()` is based on URLSearchParams which already decodes percent-encoding.
      // Avoid calling `decodeURIComponent` here to prevent double-decode and URIError on strings containing `%`.
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0)
      .slice(0, MAX_ACTIVE_SEARCH_TAGS)
  );
}
