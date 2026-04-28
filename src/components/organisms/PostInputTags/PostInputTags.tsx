'use client';

import { useState } from 'react';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import { POST_MAX_TAGS, TAG_INPUT_WIDTH_AT_LIMIT, TAG_INPUT_WIDTH_DEFAULT } from '@/config';
import type { PostInputTagsProps } from './PostInputTags.types';

export function PostInputTags({ tags, onTagsChange, maxTags = POST_MAX_TAGS, disabled = false }: PostInputTagsProps) {
  const [isAddingTag, setIsAddingTag] = useState(false);

  const isAtLimit = tags.length >= maxTags;
  const isDisabled = disabled || isAtLimit;
  const inputWidth = isAtLimit ? TAG_INPUT_WIDTH_AT_LIMIT : TAG_INPUT_WIDTH_DEFAULT;

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
        <Molecules.TagInputToggle
          showInput={isAddingTag}
          widthByState={{ input: inputWidth, addButton: 34 }}
          inputContent={
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
              autoFocus={isAddingTag}
              excludeFromApiSuggestions={tags}
              addOnSuggestionClick
              containerVariant="plain"
              className="w-full shrink-0"
            />
          }
          addButtonContent={
            <Molecules.PostTagAddButton
              onClick={() => {
                setIsAddingTag(true);
              }}
              disabled={isDisabled}
              variant="plain"
            />
          }
        />
      </Atoms.Container>
    </Atoms.Container>
  );
}
