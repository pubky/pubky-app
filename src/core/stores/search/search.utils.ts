import { getMaxStreamTags } from '@/libs/runtime-config/runtime-config';

/**
 * Shared utility for adding a tag to an array with business logic:
 * - If tag exists, move it to the end
 * - If at max capacity, remove oldest (first) tag
 * - Otherwise, append to end
 *
 * Used by both calculateNewTags (hook) and addActiveTag (store) for consistency.
 *
 * @param currentTags - Current array of tags
 * @param newTag - Tag to add (should be normalized)
 * @param maxTags - Maximum number of tags allowed (default: getMaxStreamTags())
 * @returns New array with tag added
 */
export function addTagToArray(currentTags: string[], newTag: string, maxTags: number = getMaxStreamTags()): string[] {
  if (newTag.length === 0) return currentTags;

  // Check if tag already exists
  const existingIndex = currentTags.indexOf(newTag);

  if (existingIndex >= 0) {
    // Move existing tag to end
    const tagsWithoutExisting = currentTags.filter((t) => t !== newTag);
    return [...tagsWithoutExisting, newTag];
  }

  // If at max, remove oldest (first) tag
  if (currentTags.length >= maxTags) {
    return [...currentTags.slice(1), newTag];
  }

  return [...currentTags, newTag];
}

/**
 * Helper function to add an item to the top of an array with business logic:
 * - If item exists (by predicate), move it to top
 * - If at max capacity, remove oldest (last) item
 * - Otherwise, add to top
 *
 * Used for recent searches (users and tags) to move existing items to top.
 *
 * @param array - Current array
 * @param item - Item to add
 * @param predicate - Function to find matching item in array
 * @param maxItems - Maximum number of items allowed
 * @returns New array with item added/moved to top
 */
export function addItemToTop<T>(array: T[], item: T, predicate: (element: T) => boolean, maxItems: number): T[] {
  const existingIndex = array.findIndex(predicate);

  if (existingIndex >= 0) {
    // Move existing item to top
    const itemsWithoutExisting = array.filter((element) => !predicate(element));
    return [item, ...itemsWithoutExisting];
  }

  // Add new item to top, remove oldest (last) if at limit
  if (array.length >= maxItems) {
    return [item, ...array.slice(0, maxItems - 1)];
  }

  return [item, ...array];
}
