'use client';

import { Tag } from 'lucide-react';
import { IllustratedEmptyState } from '../IllustratedEmptyState/IllustratedEmptyState';
import { TagInput } from '../TagInput/TagInput';
import type { TaggedEmptyProps } from './TaggedEmpty.types';

export function TaggedEmpty({ onTagAdd }: TaggedEmptyProps) {
  return (
    <IllustratedEmptyState
      imageSrc="/images/tagged-empty-state.webp"
      imageAlt={'Tagged - Empty state'}
      icon={Tag}
      title={'Discover who tagged you'}
      // The Tip hint starts on its own line in the design; a plain string newline
      // would be collapsed by HTML whitespace, so the break is explicit.
      subtitle={
        <>
          No one has tagged you yet.
          <br />
          Tip: You can add tags to your own profile too.
        </>
      }
    >
      {/* The input is a compact field in the design, not the full column width. */}
      {onTagAdd && (
        <TagInput onTagAdd={onTagAdd} enableApiSuggestions addOnSuggestionClick className="w-48" />
      )}
    </IllustratedEmptyState>
  );
}