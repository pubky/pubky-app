'use client';

import { Search } from 'lucide-react';
import { IllustratedEmptyState } from '../IllustratedEmptyState/IllustratedEmptyState';

/**
 * FilterPostsEmpty
 *
 * Shown on the profile Posts tab when an active "Filter posts" query matches
 * nothing. Copy and artwork are placeholders pending design confirmation —
 * issue #2234 and its Figma frame document no no-results state.
 */
export function FilterPostsEmpty() {
  return (
    <IllustratedEmptyState
      imageSrc="/images/tagged-empty-state.webp"
      imageAlt={'Filter posts - Empty state'}
      icon={Search}
      title={'No posts match your search'}
      subtitle={'Try a different search term.'}
    />
  );
}
