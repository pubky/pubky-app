import { APP_ROUTES } from '@/app/routes';
import { addTagToArray } from '@/stores/search/search.utils';
/**
 * Builds search URL from tags array
 * Note: Tags should be normalized (lowercase, trimmed) before calling
 */
export function buildSearchUrl(tags: string[]): string {
  if (tags.length === 0) return APP_ROUTES.SEARCH;
  const tagsParam = tags.map((t) => encodeURIComponent(t)).join(',');
  return `${APP_ROUTES.SEARCH}?tags=${tagsParam}`;
}

/**
 * Calculates new tags array when adding a tag
 * Uses shared utility from store for consistency
 * Note: Tag should be normalized (lowercase, trimmed) before calling
 */
export function calculateNewTags(currentTags: string[], newTag: string): string[] {
  return addTagToArray(currentTags, newTag);
}
