'use client';

/**
 * Search Empty State Component
 *
 * Displayed when no tags are provided in the URL.
 * Guides the user on how to search for posts.
 */
import { Search } from 'lucide-react';
import { IllustratedEmptyState } from '../IllustratedEmptyState/IllustratedEmptyState';

export function SearchEmptyState() {
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
