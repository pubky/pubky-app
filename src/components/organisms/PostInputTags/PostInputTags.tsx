'use client';

import { useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { POST_MAX_TAGS } from '@/config/posts';
import { TAG_INPUT_WIDTH_AT_LIMIT, TAG_INPUT_WIDTH_DEFAULT } from '@/config/tags';
import { PostTagAddButton } from '@/molecules/PostTagAddButton/PostTagAddButton';
import { TagInput } from '@/molecules/TagInput/TagInput';
import { TagInputToggle } from '@/molecules/TagInputToggle/TagInputToggle';
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
    <Container overrideDefaults className="flex flex-col gap-1">
      <Container overrideDefaults className="flex flex-wrap items-center gap-2">
        <TagInputToggle
          showInput={isAddingTag}
          widthByState={{ input: inputWidth, addButton: 34 }}
          inputContent={
            <TagInput
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
            <PostTagAddButton
              onClick={() => {
                setIsAddingTag(true);
              }}
              disabled={isDisabled}
              variant="plain"
            />
          }
        />
      </Container>
    </Container>
  );
}
