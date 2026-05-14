import { TAG_SUGGESTIONS_DEFAULT_LIMIT } from '../useTagSuggestions/useTagSuggestions.constants';
import { TAG_INPUT_MAX_SUGGESTIONS } from './useTagInput.constants';
import type { TagLabel } from './useTagInput.types';

/**
 * Merge local tag suggestions with API suggestions (local first, deduplicated, capped).
 *
 * @param local - Suggestions from local/hook filtering
 * @param api - Suggestions from API (string labels)
 * @param enabled - Whether to include API suggestions
 * @param limit - Max combined suggestions (default: TAG_SUGGESTIONS_DEFAULT_LIMIT)
 */
export function mergeTagSuggestions(
  local: readonly TagLabel[],
  api: readonly string[],
  enabled: boolean,
  limit = TAG_SUGGESTIONS_DEFAULT_LIMIT,
): TagLabel[] {
  if (!enabled || api.length === 0) return [...local];
  const localSet = new Set(local.map((t) => t.label.toLowerCase()));
  const apiTagsToAdd = api.filter((label) => !localSet.has(label.toLowerCase())).map((label) => ({ label }));
  return [...local, ...apiTagsToAdd].slice(0, limit);
}

/**
 * Filter tags for autocomplete suggestions based on input text.
 * Returns tags that contain the input text (case-insensitive),
 * excluding exact matches.
 *
 * @param tags - Array of tag objects with a label property
 * @param inputValue - Current input text to match against
 * @param maxResults - Maximum number of suggestions to return (default: TAG_INPUT_MAX_SUGGESTIONS)
 * @returns Filtered array of tags that match the input, limited to maxResults
 *
 * @example
 * ```ts
 * const tags = [{ label: 'bitcoin' }, { label: 'btc' }, { label: 'lightning' }];
 * filterSuggestions(tags, 'bit'); // [{ label: 'bitcoin' }]
 * filterSuggestions(tags, 'bitcoin'); // [] (exact match excluded)
 * filterSuggestions(tags, ''); // [] (empty input)
 * ```
 */
export function filterSuggestions<T extends { label: string }>(
  tags: T[],
  inputValue: string,
  maxResults = TAG_INPUT_MAX_SUGGESTIONS,
): T[] {
  const trimmed = inputValue.trim();
  if (!trimmed) return [];

  const inputText = trimmed.toLowerCase();

  return tags
    .filter((tag) => {
      const tagLabel = tag.label.toLowerCase();
      return tagLabel.includes(inputText) && tagLabel !== inputText;
    })
    .slice(0, maxResults);
}
