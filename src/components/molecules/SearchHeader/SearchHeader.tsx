'use client';
import { Heading } from '@/atoms/Heading/Heading';
import type { SearchHeaderProps } from './SearchHeader.types';

/**
 * Search Header Component
 *
 * Displays the current full-text query or search tags above the results.
 * Uses the same styling as FilterHeader (font-light text-muted-foreground).
 *
 * @returns null if neither search criterion is present
 */
export function SearchHeader({ tags, query }: SearchHeaderProps) {
  if (!query && tags.length === 0) {
    return null;
  }

  const criteria = query ?? tags.join(', ');

  return (
    <Heading level={2} size="lg" className="font-light text-muted-foreground">
      {`Results for: ${criteria}`}
    </Heading>
  );
}
