'use client';

import { Search } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { IllustratedEmptyState } from '../IllustratedEmptyState/IllustratedEmptyState';

interface SearchResultsEmptyProps {
  isCollections: boolean;
  /** Offered while a narrower reach than All is selected. */
  onSearchAll?: () => void;
}

/**
 * SearchResultsEmpty
 *
 * Shown when a settled search returns no posts (or collections) for the current criteria.
 */
export function SearchResultsEmpty({ isCollections, onSearchAll }: SearchResultsEmptyProps) {
  return (
    <IllustratedEmptyState
      imageSrc="/images/tagged-empty-state.webp"
      imageAlt="Search results - Empty state"
      icon={Search}
      title={isCollections ? 'No collections match your search' : 'No posts match your search'}
      subtitle={onSearchAll ? 'Try searching in All.' : 'Try different search terms or filters.'}
    >
      {onSearchAll && <Button onClick={onSearchAll}>{'Search in All'}</Button>}
    </IllustratedEmptyState>
  );
}
