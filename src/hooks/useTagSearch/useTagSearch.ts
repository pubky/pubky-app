'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchStore } from '@/stores/search/search.store';
import type { TagSearchOptions, UseTagSearchResult } from './useTagSearch.types';
import { buildSearchUrl, calculateNewTags } from './useTagSearch.utils';

export function useTagSearch(): UseTagSearchResult {
  const router = useRouter();
  const { activeTags, setActiveTags, removeActiveTag, addTag } = useSearchStore();

  const addTagToSearch = useCallback(
    (tag: string, options?: TagSearchOptions) => {
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
    },
    [router, activeTags, setActiveTags, addTag],
  );

  const removeTagFromSearch = useCallback(
    (tag: string) => {
      const normalizedTag = tag.trim().toLowerCase();
      const newTags = activeTags.filter((t) => t !== normalizedTag);

      removeActiveTag(normalizedTag);

      // Removing the last chip lands on the `/search` empty state — the same
      // destination as clearing the whole search from the bar's X, so the two
      // "search is now empty" paths cannot diverge (`buildSearchUrl([])` is
      // `/search`).
      router.push(buildSearchUrl(newTags));
    },
    [router, activeTags, removeActiveTag],
  );

  return {
    addTagToSearch,
    removeTagFromSearch,
    activeTags,
  };
}
