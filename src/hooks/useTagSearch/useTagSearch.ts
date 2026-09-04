'use client';

import { useRouter } from 'next/navigation';
import { useSearchStore } from '@/stores/search/search.store';
import { buildSearchUrl, calculateNewTags } from './useTagSearch.utils';

/**
 * Options for individual search operations
 */
interface TagSearchOptions {
  /** Whether to add the tag to recent searches (default: false) */
  addToRecent?: boolean;
}

/**
 * Result from useTagSearch hook
 */
interface UseTagSearchResult {
  /** Add a tag to current search (appends to existing tags) */
  addTagToSearch: (tag: string, options?: TagSearchOptions) => void;
  /** Remove a tag from current search */
  removeTagFromSearch: (tag: string) => void;
  /** Current active tags from store */
  activeTags: string[];
}

export function useTagSearch(): UseTagSearchResult {
  const router = useRouter();
  const { activeTags, setActiveTags, removeActiveTag, addTag } = useSearchStore();

  const addTagToSearch = (tag: string, options?: TagSearchOptions) => {
    const normalizedTag = tag.trim().toLowerCase();
    if (normalizedTag.length === 0) return;

    if (options?.addToRecent) {
      addTag(normalizedTag);
    }

    // Calculate new tags once (using shared utility)
    const newTags = calculateNewTags(activeTags, normalizedTag);

    // Update store with calculated tags (no duplicate calculation)
    setActiveTags(newTags);

    // Navigate with calculated tags
    router.push(buildSearchUrl(newTags));
  };

  const removeTagFromSearch = (tag: string) => {
    const normalizedTag = tag.trim().toLowerCase();
    const newTags = activeTags.filter((t) => t !== normalizedTag);

    removeActiveTag(normalizedTag);

    // Removing the last chip lands on the `/search` empty state — the same
    // destination as clearing the whole search from the bar's X, so the two
    // "search is now empty" paths cannot diverge (`buildSearchUrl([])` is
    // `/search`).
    router.push(buildSearchUrl(newTags));
  };

  return {
    addTagToSearch,
    removeTagFromSearch,
    activeTags,
  };
}
