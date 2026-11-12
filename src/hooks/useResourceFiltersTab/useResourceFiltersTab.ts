'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  hasResourceFeedFilters,
  useResourceSearchFilters,
} from '@/hooks/useResourceSearchFilters/useResourceSearchFilters';
import { useHomeStore } from '@/stores/home/home.store';
import { CONTENT } from '@/stores/home/home.types';

/**
 * A page whose External resources tab keeps its filters in the URL (Search, Home): a URL shared with
 * them opens that tab, and leaving the tab for another Content drops them, so a reload stays where
 * the viewer went. With `feed` (Home), only the filters a feed applies open it: Search's own (shared
 * by, in a collection, related tags, tag match) do nothing there.
 */
export function useResourceFiltersTab({ feed = false }: { feed?: boolean } = {}): void {
  const content = useHomeStore((state) => state.content);
  const setContent = useHomeStore((state) => state.setContent);
  const searchParams = useSearchParams();
  const { hasFilters: hasSearchFilters, clearFilters } = useResourceSearchFilters();
  const hasFilters = feed ? hasResourceFeedFilters(searchParams) : hasSearchFilters;
  const previousContent = useRef(content);
  useEffect(() => {
    if (hasFilters) setContent(CONTENT.RESOURCES);
  }, [hasFilters, setContent]);
  useEffect(() => {
    if (previousContent.current === CONTENT.RESOURCES && content !== CONTENT.RESOURCES && hasFilters) clearFilters();
    previousContent.current = content;
  }, [content, hasFilters, clearFilters]);
}
