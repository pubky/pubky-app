'use client';

/**
 * Search Empty State Component
 *
 * Displayed when no tags are provided in the URL.
 * Guides the user on how to search for posts.
 */
import { Search } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { IllustratedEmptyState } from '../IllustratedEmptyState/IllustratedEmptyState';

type SearchEmptyStateProps =
  { variant?: 'initial' } | { variant: 'results'; isCollections: boolean; onSearchAll?: () => void };

export function SearchEmptyState(props: SearchEmptyStateProps = {}) {
  if (props.variant === 'results') {
    return (
      <IllustratedEmptyState
        imageSrc="/images/tagged-empty-state.webp"
        imageAlt="Search results - Empty state"
        icon={Search}
        title={props.isCollections ? 'No collections match your search' : 'No posts match your search'}
        subtitle={props.onSearchAll ? 'Try searching in All.' : 'Try different search terms or filters.'}
      >
        {props.onSearchAll && <Button onClick={props.onSearchAll}>{'Search in All'}</Button>}
      </IllustratedEmptyState>
    );
  }
  return (
    <IllustratedEmptyState
      imageSrc="/images/tagged-empty-state.webp"
      imageAlt={'Search - Empty state'}
      icon={Search}
      title={'Search for posts by tags'}
      subtitle={
        <>
          {'Use the search bar or click on a tag to discover posts.'}
          <br />
          {'You can search for multiple tags separated by commas.'}
        </>
      }
    />
  );
}
