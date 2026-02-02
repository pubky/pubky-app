'use client';

import { useState } from 'react';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import { POST_MAX_TAGS } from '@/config';
import type { PostInputTagsProps } from './PostInputTags.types';

export function PostInputTags({ tags, onTagsChange, maxTags = POST_MAX_TAGS, disabled = false }: PostInputTagsProps) {
  const [isAddingTag, setIsAddingTag] = useState(false);

  const isAtLimit = tags.length >= maxTags;
  const isDisabled = disabled || isAtLimit;

  const handleTagAdd = (tag: string) => {
    // Duplicate check is handled by useTagInput internally
    onTagsChange([...tags, tag]);
  };

  const handleInputBlur = () => {
    // Will be called by TagInput when input loses focus and is empty
    setIsAddingTag(false);
  };

  const handleCloseInput = () => {
    setIsAddingTag(false);
  };

  return (
    <Atoms.Container overrideDefaults className="flex flex-col gap-1">
      <Atoms.Container overrideDefaults className="flex flex-wrap items-center gap-2">
        {/* Add tag input - keep visible but disabled during loading */}
        {isAddingTag && (
          <Molecules.TagInput
            onTagAdd={handleTagAdd}
            existingTags={tags.map((tag) => ({ label: tag }))}
            showCloseButton={!disabled}
            onClose={handleCloseInput}
            disabled={disabled}
            maxTags={maxTags}
            currentTagsCount={tags.length}
            onBlur={disabled ? undefined : handleInputBlur}
            enableApiSuggestions
            excludeFromApiSuggestions={tags}
            addOnSuggestionClick
          />
        )}

        {/* Add button - disabled when at limit or disabled */}
        {!isAddingTag && (
          <Molecules.PostTagAddButton
            onClick={() => {
              setIsAddingTag(true);
            }}
            disabled={isDisabled}
          />
        )}
      </Atoms.Container>
    </Atoms.Container>
  );
}
