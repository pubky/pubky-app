'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { cn } from '@/libs/utils/utils';
import { PostTag } from '@/molecules/PostTag/PostTag';
import { TagInput } from '@/molecules/TagInput/TagInput';
import { HOME_PROFILE_TAGS_MAX_SELECTED } from '@/stores/home/home.types';
import type { FilterProfileTagsProps } from './FilterProfileTags.types';

export function FilterProfileTags({
  selectedTags,
  onTagAdd,
  onTagRemove,
  disabled = false,
  maxTags = HOME_PROFILE_TAGS_MAX_SELECTED,
}: FilterProfileTagsProps) {
  const t = useTranslations('filters.reach');

  // The store clears selected tags the moment a gated reach (All) is picked,
  // which would unmount the chips before the collapse animation can play. Freeze
  // the last tags shown while disabled so tags and input collapse together.
  const [frozenTags, setFrozenTags] = useState(selectedTags);
  if (!disabled && frozenTags !== selectedTags) {
    setFrozenTags(selectedTags);
  }
  const displayTags = disabled ? frozenTags : selectedTags;

  const isAtLimit = displayTags.length >= maxTags;
  const isInputDisabled = disabled || isAtLimit;
  const existingTags = displayTags.map((label) => ({ label }));

  const handleTagAdd = (tag: string) => {
    const normalizedTag = tag.trim().toLowerCase();
    if (!normalizedTag || selectedTags.length >= maxTags) {
      return;
    }
    onTagAdd(normalizedTag);
  };

  return (
    <Container
      overrideDefaults
      aria-hidden={disabled}
      className={cn(
        'grid w-full transition-all duration-300 ease-in-out',
        disabled ? 'pointer-events-none grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
      )}
    >
      <Container overrideDefaults className="overflow-hidden">
        <Container overrideDefaults className="flex w-full flex-col gap-1 py-1">
          {displayTags.map((tag) => (
            <PostTag
              key={tag}
              label={tag}
              showClose
              onClose={() => onTagRemove(tag)}
              className="w-32 justify-between"
            />
          ))}

          <TagInput
            onTagAdd={handleTagAdd}
            placeholder={t('profileTag')}
            existingTags={existingTags}
            viewerTags={existingTags}
            disabled={isInputDisabled}
            maxTags={maxTags}
            currentTagsCount={displayTags.length}
            limitReachedPlaceholder={t('profileTagLimitReached', { max: maxTags })}
            showEmojiButton={!isAtLimit}
            enableApiSuggestions
            excludeFromApiSuggestions={displayTags}
            addOnSuggestionClick
            className="w-32"
          />
        </Container>
      </Container>
    </Container>
  );
}
