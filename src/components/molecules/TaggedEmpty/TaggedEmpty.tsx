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
      subtitle={'No one has tagged you yet.\nTip: You can add tags to your own profile too.'}
    >
      {onTagAdd && <TagInput onTagAdd={onTagAdd} enableApiSuggestions addOnSuggestionClick />}
    </IllustratedEmptyState>
  );
}
